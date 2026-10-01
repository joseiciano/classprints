import { afterEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { Sql } from '../src/lib/db';
import { createAssignmentReaderRepository } from '../src/assignment-reader/assignment-reader.repository';

/**
 * Integration proof for the replacePageRow review fix: runs the real
 * repository — real SQL through postgres.js against a live Postgres — so the
 * draft_confirmed bug (a service-layer fake repo cannot reproduce a bug that
 * lives in a hand-written SQL expression) is pinned at the layer it actually
 * lives in. Requires a local Postgres seeded with database/migrations/*.sql
 * (see scripts/migrate.sh). Skipped when AR_TEST_DATABASE_URL is unset so
 * `pnpm test` stays green locally; CI (.github/workflows/ci.yml) provides it
 * against a migrated service database.
 */

const connectionString = process.env.AR_TEST_DATABASE_URL;
const d = connectionString
  ? describe
  : (name: string, _fn: () => void) =>
      it.skip(`${name} (set AR_TEST_DATABASE_URL to run)`, () => {});

d('integration: assignment-reader repository against live Postgres', () => {
  let sql: postgres.Sql;

  afterEach(async () => {
    await sql?.end();
  });

  interface Scope {
    teacherId: string;
    classId: string;
    studentId: string;
    assignmentId: string;
    submissionId: string;
  }

  const seedSubmissionScope = async (scope: Scope, now: number): Promise<void> => {
    await sql.begin(async (tx) => {
      await tx`insert into public.users (id, email, password_hash) values (${scope.teacherId}, ${scope.teacherId + '@t.test'}, 'x')`;
      await tx`insert into public.classes (id, teacher_id, name, created_at_ms, updated_at_ms) values (${scope.classId}, ${scope.teacherId}, 'C', ${now}, ${now})`;
      await tx`insert into public.students (id, class_id, teacher_id, name, created_at_ms, updated_at_ms) values (${scope.studentId}, ${scope.classId}, ${scope.teacherId}, 'S', ${now}, ${now})`;
      await tx`insert into public.assignments (id, class_id, teacher_id, name, created_at_ms, updated_at_ms) values (${scope.assignmentId}, ${scope.classId}, ${scope.teacherId}, 'A', ${now}, ${now})`;
      await tx`insert into public.submissions (id, assignment_id, class_id, student_id, teacher_id, draft_confirmed, confirmed_at_ms, review_state, created_at_ms, updated_at_ms)
        values (${scope.submissionId}, ${scope.assignmentId}, ${scope.classId}, ${scope.studentId}, ${scope.teacherId}, false, null, null, ${now}, ${now})`;
    });
  };

  const insertPage = async (
    pageId: string,
    scope: Scope,
    position: number,
    state: 'uploading' | 'failed',
    now: number,
  ): Promise<void> => {
    if (state === 'failed') {
      await sql`insert into public.pages (
          id, document_type, submission_id, student_id, class_id, assignment_id, teacher_id,
          position, label, storage_key, processing_state, attempt_count, page_revision,
          failure_code, failure_message, queued_at_ms, started_at_ms, completed_at_ms,
          uploaded_at_ms, created_at_ms, updated_at_ms
        ) values (
          ${pageId}, 'submission', ${scope.submissionId}, ${scope.studentId}, ${scope.classId}, ${scope.assignmentId}, ${scope.teacherId},
          ${position}, 'Page', 'it/' || ${pageId} || '.jpg', 'failed', 1, 1,
          'provider_timeout', 'timed out', ${now}, ${now}, ${now},
          ${now}, ${now}, ${now}
        )`;
    } else {
      await sql`insert into public.pages (
          id, document_type, submission_id, student_id, class_id, assignment_id, teacher_id,
          position, label, storage_key, processing_state, attempt_count, page_revision,
          uploaded_at_ms, created_at_ms, updated_at_ms
        ) values (
          ${pageId}, 'submission', ${scope.submissionId}, ${scope.studentId}, ${scope.classId}, ${scope.assignmentId}, ${scope.teacherId},
          ${position}, 'Page', 'it/' || ${pageId} || '.jpg', 'uploading', 0, 1,
          ${now}, ${now}, ${now}
        )`;
    }
  };

  const readSubmission = async (submissionId: string) => {
    const rows = await sql<({ draft_confirmed: boolean; confirmed_at_ms: string | null })[]>`
      select draft_confirmed, confirmed_at_ms from public.submissions where id = ${submissionId}
    `;
    return rows[0]!;
  };

  const cleanup = async (teacherId: string): Promise<void> => {
    await sql`delete from public.users where id = ${teacherId}`;
  };

  it(
    'leaves draft_confirmed false when recovering a failed page while a sibling is still uploading (replacePageRow regression)',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: '71717171-7171-4717-8717-171717171717',
        classId: '72727272-7272-4727-8727-272727272727',
        studentId: '73737373-7373-4737-8737-373737373737',
        assignmentId: '74747474-7474-4747-8747-474747474747',
        submissionId: '75757575-7575-4757-8757-575757575757',
      };
      const failedPageId = '76767676-7676-4767-8767-676767676767';
      const uploadingSiblingId = '77777777-7777-4777-8777-777777777777';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      // One page already failed (would have been confirmed before it
      // failed); a newer sibling page was added afterward, which
      // addPageRow's contract resets draft_confirmed to false for (see the
      // comment on that write) — simulated directly here since this test
      // targets replacePageRow in isolation.
      await insertPage(failedPageId, scope, 1, 'failed', now);
      await insertPage(uploadingSiblingId, scope, 2, 'uploading', now);

      const before = await readSubmission(scope.submissionId);
      expect(before.draft_confirmed).toBe(false);

      // Recover the failed page: requeueImmediately=true, the same input
      // the service sends for a `failed` page (see replacePage in
      // assignment-reader.service.ts).
      await repo.replacePageRow({
        id: '78787878-7878-4787-8787-878787878787',
        teacherId: scope.teacherId,
        documentType: 'submission',
        materialsVersionId: null,
        submissionId: scope.submissionId,
        studentId: scope.studentId,
        classId: scope.classId,
        assignmentId: scope.assignmentId,
        replacedPageId: failedPageId,
        position: 1,
        pageRevision: 2,
        label: 'Page',
        storageKey: 'it/replacement.jpg',
        requeueImmediately: true,
      });

      // The bug: this used to unconditionally flip draft_confirmed to true
      // (= requeueImmediately), stranding uploadingSiblingId in 'uploading'
      // forever because confirmDocument() 409s once draft_confirmed is
      // already true.
      const after = await readSubmission(scope.submissionId);
      expect(after.draft_confirmed).toBe(false);
      expect(after.confirmed_at_ms).toBeNull();

      // The still-unconfirmed sibling remains queueable: confirmDocument's
      // caller-side precondition (findDocumentStatus().draft_confirmed) is
      // false, so the route would not 409.
      const status = await repo.findDocumentStatus(scope.teacherId, 'submission', scope.submissionId);
      expect(status?.draft_confirmed).toBe(false);

      await cleanup(scope.teacherId);
    },
  );

  it(
    'keeps draft_confirmed true when recovering a failed page with no unconfirmed siblings',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: '81818181-8181-4818-8818-181818181818',
        classId: '82828282-8282-4828-8828-282828282828',
        studentId: '83838383-8383-4838-8838-383838383838',
        assignmentId: '84848484-8484-4848-8848-484848484848',
        submissionId: '85858585-8585-4858-8858-585858585858',
      };
      const failedPageId = '86868686-8686-4868-8868-686868686868';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertPage(failedPageId, scope, 1, 'failed', now);
      // The document was fully confirmed (no other page pending) before this
      // one page failed.
      await sql`update public.submissions set draft_confirmed = true, confirmed_at_ms = ${now} where id = ${scope.submissionId}`;

      await repo.replacePageRow({
        id: '87878787-8787-4878-8878-878787878787',
        teacherId: scope.teacherId,
        documentType: 'submission',
        materialsVersionId: null,
        submissionId: scope.submissionId,
        studentId: scope.studentId,
        classId: scope.classId,
        assignmentId: scope.assignmentId,
        replacedPageId: failedPageId,
        position: 1,
        pageRevision: 2,
        label: 'Page',
        storageKey: 'it/replacement.jpg',
        requeueImmediately: true,
      });

      const after = await readSubmission(scope.submissionId);
      expect(after.draft_confirmed).toBe(true);
      expect(after.confirmed_at_ms).not.toBeNull();

      await cleanup(scope.teacherId);
    },
  );

  it(
    'always forces draft_confirmed false when the replaced page was still uploading',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: '91919191-9191-4919-8919-191919191919',
        classId: '92929292-9292-4929-8929-292929292929',
        studentId: '93939393-9393-4939-8939-393939393939',
        assignmentId: '94949494-9494-4949-8949-494949494949',
        submissionId: '95959595-9595-4959-8959-595959595959',
      };
      const uploadingPageId = '96969696-9696-4969-8969-696969696969';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertPage(uploadingPageId, scope, 1, 'uploading', now);

      await repo.replacePageRow({
        id: '97979797-9797-4979-8979-797979797979',
        teacherId: scope.teacherId,
        documentType: 'submission',
        materialsVersionId: null,
        submissionId: scope.submissionId,
        studentId: scope.studentId,
        classId: scope.classId,
        assignmentId: scope.assignmentId,
        replacedPageId: uploadingPageId,
        position: 1,
        pageRevision: 2,
        label: 'Page',
        storageKey: 'it/replacement.jpg',
        requeueImmediately: false,
      });

      const after = await readSubmission(scope.submissionId);
      expect(after.draft_confirmed).toBe(false);
      expect(after.confirmed_at_ms).toBeNull();

      await cleanup(scope.teacherId);
    },
  );
});
