import { afterEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { Sql } from '../src/lib/db';
import { createAssignmentReaderRepository } from '../src/assignment-reader/assignment-reader.repository';
import { DeletionScopeConflictError } from '../src/assignment-reader/assignment-reader.types';

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

  const readSubmissionFull = async (submissionId: string) => {
    const rows = await sql<
      ({
        document_revision: number;
        review_state: string | null;
        grading_state: string;
        graded_at_ms: string | null;
        score: string | null;
      })[]
    >`
      select document_revision, review_state, grading_state, graded_at_ms, score
      from public.submissions where id = ${submissionId}
    `;
    return rows[0]!;
  };

  const readPage = async (pageId: string) => {
    const rows = await sql<
      ({
        processing_state: string;
        page_revision: number;
        attempt_count: number;
        failure_code: string | null;
        failure_message: string | null;
        draft: unknown;
        started_at_ms: string | null;
        completed_at_ms: string | null;
        queued_at_ms: string | null;
        content_revision: number;
        reviewed_content_revision: number | null;
        reviewed_at_ms: string | null;
        edited_by_teacher: boolean;
        teacher_edit_count: number;
      })[]
    >`
      select processing_state, page_revision, attempt_count, failure_code, failure_message,
             draft, started_at_ms, completed_at_ms, queued_at_ms,
             content_revision, reviewed_content_revision, reviewed_at_ms,
             edited_by_teacher, teacher_edit_count
      from public.pages where id = ${pageId}
    `;
    return rows[0]!;
  };

  const insertCompletedPage = async (
    pageId: string,
    scope: Scope,
    position: number,
    now: number,
    editedByTeacher = false,
  ): Promise<void> => {
    await sql`insert into public.pages (
        id, document_type, submission_id, student_id, class_id, assignment_id, teacher_id,
        position, label, storage_key, processing_state, attempt_count, page_revision,
        edited_by_teacher, draft, queued_at_ms, started_at_ms, completed_at_ms,
        uploaded_at_ms, created_at_ms, updated_at_ms
      ) values (
        ${pageId}, 'submission', ${scope.submissionId}, ${scope.studentId}, ${scope.classId}, ${scope.assignmentId}, ${scope.teacherId},
        ${position}, 'Page', 'it/' || ${pageId} || '.jpg', 'completed', 1, 1,
        ${editedByTeacher}, ${sql.json({ schemaVersion: 1, doc: { type: 'doc', content: [] } })}::jsonb,
        ${now}, ${now}, ${now},
        ${now}, ${now}, ${now}
      )`;
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

  it(
    'retryPageRow (TASK-015): bumps only the page and document revision, resets attempt/failure/timing, and returns the submission to not_graded',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
        classId: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2',
        studentId: 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
        assignmentId: 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4',
        submissionId: 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5',
      };
      const failedPageId = 'a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6';
      const siblingPageId = 'a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertPage(failedPageId, scope, 1, 'failed', now);
      await insertCompletedPage(siblingPageId, scope, 2, now);
      await sql`
        update public.submissions set
          draft_confirmed = true, confirmed_at_ms = ${now}, document_revision = 2,
          review_state = 'ready_to_grade', grading_state = 'graded', graded_at_ms = ${now},
          score = 9
        where id = ${scope.submissionId}
      `;
      // Simulate a page that was completed, edited and reviewed by the
      // teacher, then re-queued and failed again before this retry — its
      // stale edit/review state must not survive the new attempt.
      await sql`
        update public.pages set
          content_revision = 3, reviewed_content_revision = 2, reviewed_at_ms = ${now},
          edited_by_teacher = true, teacher_edit_count = 2
        where id = ${failedPageId}
      `;

      const result = await repo.retryPageRow(scope.teacherId, failedPageId);
      expect(result).not.toBeNull();
      expect(result!.page.page_revision).toBe(2);
      expect(result!.page.processing_state).toBe('queued');
      expect(result!.documentRevision).toBe(3);

      const page = await readPage(failedPageId);
      expect(page.processing_state).toBe('queued');
      expect(page.page_revision).toBe(2);
      expect(page.attempt_count).toBe(0);
      expect(page.failure_code).toBeNull();
      expect(page.failure_message).toBeNull();
      expect(page.draft).toBeNull();
      expect(page.started_at_ms).toBeNull();
      expect(page.completed_at_ms).toBeNull();
      expect(page.queued_at_ms).not.toBeNull();
      // A new transcription attempt starts with no review of its (not yet
      // existing) content, and `editedByTeacher` describes only the current
      // revision's draft (TASK-015 regression: these must not leak from the
      // superseded page_revision). `contentRevision` and `teacherEditCount`
      // are teacher-edit-scoped counters that retry must leave untouched
      // (api-routes-documents.md: "contentRevision is teacher-edit-scoped
      // and is not incremented by upload, replacement, retry, or
      // retranscription").
      expect(page.content_revision).toBe(3);
      expect(page.reviewed_content_revision).toBeNull();
      expect(page.reviewed_at_ms).toBeNull();
      expect(page.edited_by_teacher).toBe(false);
      expect(page.teacher_edit_count).toBe(2);

      // The untouched sibling keeps its own revision and completed draft.
      const sibling = await readPage(siblingPageId);
      expect(sibling.page_revision).toBe(1);
      expect(sibling.processing_state).toBe('completed');

      const submission = await readSubmissionFull(scope.submissionId);
      expect(submission.document_revision).toBe(3);
      expect(submission.review_state).toBeNull();
      expect(submission.grading_state).toBe('not_graded');
      expect(submission.graded_at_ms).toBeNull();
      // Score is retained across a retry (REQ-013 §3.3: only review/grading
      // state resets, draft grading fields are untouched).
      expect(Number(submission.score)).toBe(9);

      await cleanup(scope.teacherId);
    },
  );

  it(
    'retryPageRow (TASK-015): returns null without writing when the page is not exactly failed (conditional-update race guard)',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
        classId: 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
        studentId: 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3',
        assignmentId: 'b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4',
        submissionId: 'b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5',
      };
      const uploadingPageId = 'b6b6b6b6-b6b6-4b6b-8b6b-b6b6b6b6b6b6';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertPage(uploadingPageId, scope, 1, 'uploading', now);

      const result = await repo.retryPageRow(scope.teacherId, uploadingPageId);
      expect(result).toBeNull();

      const page = await readPage(uploadingPageId);
      expect(page.processing_state).toBe('uploading');
      expect(page.page_revision).toBe(1);
      const submission = await readSubmissionFull(scope.submissionId);
      expect(submission.document_revision).toBe(1); // nothing committed

      await cleanup(scope.teacherId);
    },
  );

  it(
    'retranscribeDocumentRows (TASK-015): bumps every current completed page and the document revision once, clears generated content, and resets submission grading',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
        classId: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
        studentId: 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3',
        assignmentId: 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4',
        submissionId: 'c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5',
      };
      const page1 = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6';
      const page2 = 'c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertCompletedPage(page1, scope, 1, now, true);
      await insertCompletedPage(page2, scope, 2, now);
      // page1 was edited and reviewed by the teacher before this
      // retranscription; the new attempt must not inherit that state.
      await sql`
        update public.pages set
          content_revision = 4, reviewed_content_revision = 4, reviewed_at_ms = ${now},
          teacher_edit_count = 3
        where id = ${page1}
      `;
      await sql`
        update public.submissions set
          draft_confirmed = true, confirmed_at_ms = ${now}, document_revision = 2,
          review_state = 'ready_to_grade', grading_state = 'graded', graded_at_ms = ${now},
          score = 10
        where id = ${scope.submissionId}
      `;

      const result = await repo.retranscribeDocumentRows({
        teacherId: scope.teacherId,
        documentType: 'submission',
        documentId: scope.submissionId,
        expectedDocumentRevision: 2,
      });
      expect(result).not.toBeNull();
      expect(result!.documentRevision).toBe(3);
      expect(result!.pages).toHaveLength(2);
      expect(result!.pages.every((page) => page.page_revision === 2)).toBe(true);
      expect(result!.pages.every((page) => page.processing_state === 'queued')).toBe(true);

      const p1 = await readPage(page1);
      expect(p1.processing_state).toBe('queued');
      expect(p1.page_revision).toBe(2);
      expect(p1.draft).toBeNull();
      expect(p1.completed_at_ms).toBeNull();
      expect(p1.started_at_ms).toBeNull();
      // TASK-015 regression: a fresh transcription attempt must not keep the
      // superseded revision's review state or `editedByTeacher` flag (which
      // describes only the current revision's draft), otherwise
      // evaluateRetranscriptionConsent() would permanently require
      // overwriteTeacherEdits consent for a page nobody has edited yet.
      // `contentRevision` and `teacherEditCount` are teacher-edit-scoped
      // counters that retranscription must leave untouched
      // (api-routes-documents.md §3.4: "queue every current page without
      // changing page IDs, order, or contentRevision").
      expect(p1.content_revision).toBe(4);
      expect(p1.reviewed_content_revision).toBeNull();
      expect(p1.reviewed_at_ms).toBeNull();
      expect(p1.edited_by_teacher).toBe(false);
      expect(p1.teacher_edit_count).toBe(3);

      const submission = await readSubmissionFull(scope.submissionId);
      expect(submission.document_revision).toBe(3);
      expect(submission.review_state).toBeNull();
      expect(submission.grading_state).toBe('not_graded');
      expect(submission.graded_at_ms).toBeNull();
      expect(Number(submission.score)).toBe(10); // score retained

      await cleanup(scope.teacherId);
    },
  );

  it(
    'retranscribeDocumentRows (TASK-015): returns null and commits nothing on a stale expectedDocumentRevision',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1',
        classId: 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
        studentId: 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3',
        assignmentId: 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4',
        submissionId: 'd5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5',
      };
      const page1 = 'd6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertCompletedPage(page1, scope, 1, now);
      await sql`
        update public.submissions set
          draft_confirmed = true, confirmed_at_ms = ${now}, document_revision = 2
        where id = ${scope.submissionId}
      `;

      const result = await repo.retranscribeDocumentRows({
        teacherId: scope.teacherId,
        documentType: 'submission',
        documentId: scope.submissionId,
        expectedDocumentRevision: 1, // stale
      });
      expect(result).toBeNull();

      const page = await readPage(page1);
      expect(page.processing_state).toBe('completed'); // untouched
      expect(page.page_revision).toBe(1);
      const submission = await readSubmissionFull(scope.submissionId);
      expect(submission.document_revision).toBe(2); // nothing committed

      await cleanup(scope.teacherId);
    },
  );

  it(
    'hasCurrentQuestionJudgments (TASK-015): true only for a judgment tied to the page\'s current revision',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',
        classId: 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2',
        studentId: 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3',
        assignmentId: 'e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4',
        submissionId: 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5',
      };
      const pageId = 'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6';
      const segmentId = 'e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e7';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertCompletedPage(pageId, scope, 1, now);

      expect(await repo.hasCurrentQuestionJudgments(scope.teacherId, scope.submissionId)).toBe(false);

      await sql`insert into public.question_segments (
          id, page_id, page_revision, ordinal, created_at_ms
        ) values (${segmentId}, ${pageId}, 1, 1, ${now})`;
      await sql`insert into public.question_judgments (
          id, segment_id, page_id, page_revision, teacher_id, judgment, created_at_ms, updated_at_ms
        ) values (${'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8'}, ${segmentId}, ${pageId}, 1, ${scope.teacherId}, 'correct', ${now}, ${now})`;

      expect(await repo.hasCurrentQuestionJudgments(scope.teacherId, scope.submissionId)).toBe(true);

      // Bumping the page's current revision leaves the judgment tied to the
      // now-superseded revision — PAT-004: it is audit history, not current.
      await sql`update public.pages set page_revision = 2 where id = ${pageId}`;
      expect(await repo.hasCurrentQuestionJudgments(scope.teacherId, scope.submissionId)).toBe(false);

      await cleanup(scope.teacherId);
    },
  );

  const readSubmissionGrading = async (submissionId: string) => {
    const rows = await sql<
      ({
        document_revision: number;
        review_state: string | null;
        grading_state: string;
        graded_at_ms: string | null;
        score: string | null;
        comments: string | null;
      })[]
    >`
      select document_revision, review_state, grading_state, graded_at_ms, score, comments
      from public.submissions where id = ${submissionId}
    `;
    return rows[0]!;
  };

  it(
    'updatePageDraftRow (TASK-016, TEST-003): compare-and-swap rejects a stale expectedContentRevision and a successful edit invalidates the page\'s stale review evidence',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: '11010101-0101-4101-8101-010101010101',
        classId: '12020202-0202-4202-8202-020202020202',
        studentId: '13030303-0303-4303-8303-030303030303',
        assignmentId: '14040404-0404-4404-8404-040404040404',
        submissionId: '15050505-0505-4505-8505-050505050505',
      };
      const pageId = '16060606-0606-4606-8606-060606060606';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertCompletedPage(pageId, scope, 1, now);
      // The page was already reviewed at its current (0th) content revision,
      // and the document is fully completed-and-reviewed per that stale
      // state (REQ-016 invalidation is the thing under test here).
      await sql`update public.pages set reviewed_content_revision = 0, reviewed_at_ms = ${now} where id = ${pageId}`;
      await sql`update public.submissions set review_state = 'needs_review' where id = ${scope.submissionId}`;

      // Conflicting edit: the caller's expectedContentRevision is stale.
      const stale = await repo.updatePageDraftRow({
        teacherId: scope.teacherId,
        pageId,
        draft: { schemaVersion: 1, doc: { type: 'doc', content: [] } },
        expectedContentRevision: 5,
      });
      expect(stale).toEqual({ outcome: 'conflict', currentContentRevision: 0 });
      // Nothing committed by the rejected attempt.
      const afterStale = await readPage(pageId);
      expect(afterStale.content_revision).toBe(0);
      expect(afterStale.reviewed_content_revision).toBe(0);

      // Correct revision: the edit commits and REQ-016 invalidates the now-
      // stale review evidence (a teacher's prior review of the old content
      // must not silently carry over to the new content).
      const ok = await repo.updatePageDraftRow({
        teacherId: scope.teacherId,
        pageId,
        draft: { schemaVersion: 1, doc: { type: 'doc', content: [] } },
        expectedContentRevision: 0,
      });
      expect(ok.outcome).toBe('ok');
      const afterOk = await readPage(pageId);
      expect(afterOk.content_revision).toBe(1);
      expect(afterOk.teacher_edit_count).toBe(1);
      expect(afterOk.edited_by_teacher).toBe(true);
      expect(afterOk.reviewed_content_revision).toBeNull();
      expect(afterOk.reviewed_at_ms).toBeNull();
      // The document stays gated at needs_review (every current page is
      // still completed, just no longer reviewed) rather than silently
      // staying ready — "stale review evidence cannot unlock readiness".
      const submission = await readSubmissionGrading(scope.submissionId);
      expect(submission.review_state).toBe('needs_review');

      await cleanup(scope.teacherId);
    },
  );

  it(
    'markDocumentReadyRow + markSubmissionGradedRow (TASK-016/TASK-017, TEST-003): the readiness gate blocks mark-ready until every current page is reviewed at its current revision, and the grading gate blocks grading until the document is ready_to_grade',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: '21010101-0101-4101-8101-010101010101',
        classId: '22020202-0202-4202-8202-020202020202',
        studentId: '23030303-0303-4303-8303-030303030303',
        assignmentId: '24040404-0404-4404-8404-040404040404',
        submissionId: '25050505-0505-4505-8505-050505050505',
      };
      const pageId = '26060606-0606-4606-8606-060606060606';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertCompletedPage(pageId, scope, 1, now);
      await sql`update public.submissions set review_state = 'needs_review' where id = ${scope.submissionId}`;

      // Grading gate: blocked before the document is even ready_to_grade.
      const gradedTooEarly = await repo.markSubmissionGradedRow({
        teacherId: scope.teacherId,
        submissionId: scope.submissionId,
        expectedDocumentRevision: 1,
      });
      expect(gradedTooEarly).toEqual({ outcome: 'invalid_state' });

      // Readiness gate: the one current page is completed but not yet
      // reviewed at its current (0th) content revision.
      const readyTooEarly = await repo.markDocumentReadyRow({
        teacherId: scope.teacherId,
        documentType: 'submission',
        documentId: scope.submissionId,
        expectedDocumentRevision: 1,
      });
      expect(readyTooEarly).toEqual({ outcome: 'invalid_state' });
      expect((await readSubmissionGrading(scope.submissionId)).review_state).toBe('needs_review');

      // Review the page at its current revision, then the gate opens.
      await sql`update public.pages set reviewed_content_revision = 0, reviewed_at_ms = ${now} where id = ${pageId}`;
      const ready = await repo.markDocumentReadyRow({
        teacherId: scope.teacherId,
        documentType: 'submission',
        documentId: scope.submissionId,
        expectedDocumentRevision: 1,
      });
      expect(ready.outcome).toBe('ok');
      if (ready.outcome === 'ok') expect(ready.reviewState).toBe('ready_to_grade');
      expect((await readSubmissionGrading(scope.submissionId)).review_state).toBe('ready_to_grade');

      // The grading gate now opens too.
      const graded = await repo.markSubmissionGradedRow({
        teacherId: scope.teacherId,
        submissionId: scope.submissionId,
        expectedDocumentRevision: 1,
      });
      expect(graded.outcome).toBe('ok');
      if (graded.outcome === 'ok') expect(graded.row.grading_state).toBe('graded');
      expect((await readSubmissionGrading(scope.submissionId)).grading_state).toBe('graded');

      await cleanup(scope.teacherId);
    },
  );

  it(
    'returnToNeedsReviewRow (TASK-017, TEST-003): reopening a graded submission clears graded visibility but retains the draft score and comments',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: '31010101-0101-4101-8101-010101010101',
        classId: '32020202-0202-4202-8202-020202020202',
        studentId: '33030303-0303-4303-8303-030303030303',
        assignmentId: '34040404-0404-4404-8404-040404040404',
        submissionId: '35050505-0505-4505-8505-050505050505',
      };
      const pageId = '36060606-0606-4606-8606-060606060606';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await insertCompletedPage(pageId, scope, 1, now);
      await sql`update public.pages set reviewed_content_revision = 0, reviewed_at_ms = ${now} where id = ${pageId}`;
      await sql`
        update public.submissions set
          review_state = 'ready_to_grade', grading_state = 'graded', graded_at_ms = ${now},
          score = 8, comments = 'Nice work — watch your units.'
        where id = ${scope.submissionId}
      `;

      const result = await repo.returnToNeedsReviewRow({
        teacherId: scope.teacherId,
        documentType: 'submission',
        documentId: scope.submissionId,
        expectedDocumentRevision: 1,
      });
      expect(result.outcome).toBe('ok');
      if (result.outcome === 'ok') expect(result.gradingState).toBe('not_graded');

      const submission = await readSubmissionGrading(scope.submissionId);
      expect(submission.review_state).toBe('needs_review');
      expect(submission.grading_state).toBe('not_graded');
      expect(submission.graded_at_ms).toBeNull();
      // REQ-013 §3.3 / TASK-017: draft grading fields are retained for later
      // revision, not deleted, when a graded document is reopened.
      expect(Number(submission.score)).toBe(8);
      expect(submission.comments).toBe('Nice work — watch your units.');

      // The now-stale per-page review evidence is cleared too, re-arming
      // the readiness gate (markDocumentReadyRow would reject it again).
      const page = await readPage(pageId);
      expect(page.reviewed_content_revision).toBeNull();
      expect(page.reviewed_at_ms).toBeNull();

      await cleanup(scope.teacherId);
    },
  );

  it(
    'notDeletionPending (TASK-018 review fix): a pending materials-only deletion hides the materials version and its pages but not the assignment or its submission',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
        classId: 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2',
        studentId: 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3',
        assignmentId: 'f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4',
        submissionId: 'f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5',
      };
      const materialsVersionId = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
      const materialsPageId = 'f7f7f7f7-f7f7-4f7f-8f7f-f7f7f7f7f7f7';
      const submissionPageId = 'f8f8f8f8-f8f8-4f8f-8f8f-f8f8f8f8f8f8';
      const operationId = 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f9';
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);
      await sql`insert into public.assignment_material_versions (
          id, assignment_id, teacher_id, version, lifecycle, draft_confirmed, confirmed_at_ms, created_at_ms, updated_at_ms
        ) values (${materialsVersionId}, ${scope.assignmentId}, ${scope.teacherId}, 1, 'current', true, ${now}, ${now}, ${now})`;
      await sql`insert into public.pages (
          id, document_type, materials_version_id, class_id, assignment_id, teacher_id,
          position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms
        ) values (
          ${materialsPageId}, 'materials', ${materialsVersionId}, ${scope.classId}, ${scope.assignmentId}, ${scope.teacherId},
          1, 'Page', 'it/' || ${materialsPageId} || '.jpg', 'uploading', ${now}, ${now}, ${now}
        )`;
      await insertPage(submissionPageId, scope, 1, 'uploading', now);

      // A "delete all materials" command (TASK-018) creates exactly one
      // `deletion_operations` row whose `target_id` is the ASSIGNMENT's own
      // id (assignment-reader.service.ts `deleteMaterials`) — the same id
      // space `target_type = 'assignment'` uses. Before the fix, every
      // `notDeletionPending`/`notDeletionPendingParent` guard matched this
      // row by `target_id` alone, so this pending `materials` op also hid
      // the assignment itself, its submission, and the submission's pages.
      await sql`insert into public.deletion_operations (
          id, teacher_id, target_type, target_id, status, accepted_at_ms, updated_at_ms
        ) values (${operationId}, ${scope.teacherId}, 'materials', ${scope.assignmentId}, 'pending', ${now}, ${now})`;

      expect(await repo.findMaterialVersion(scope.teacherId, materialsVersionId)).toBeNull();
      expect(await repo.findPage(scope.teacherId, materialsPageId)).toBeNull();

      const assignment = await repo.findAssignment(scope.teacherId, scope.assignmentId);
      expect(assignment).not.toBeNull();
      expect(assignment?.id).toBe(scope.assignmentId);

      const submission = await repo.findSubmission(scope.teacherId, scope.submissionId);
      expect(submission).not.toBeNull();
      expect(submission?.id).toBe(scope.submissionId);

      const submissionPage = await repo.findPage(scope.teacherId, submissionPageId);
      expect(submissionPage).not.toBeNull();
      expect(submissionPage?.id).toBe(submissionPageId);

      await cleanup(scope.teacherId);
    },
  );

  it(
    'createDeletionOperation (TASK-018 review fix): a concurrent delete under a different, id-colliding scope throws DeletionScopeConflictError instead of an unhandled unique-violation',
    { timeout: 30000 },
    async () => {
      sql = postgres(connectionString, { prepare: false, max: 2 });
      const repo = createAssignmentReaderRepository(sql as unknown as Sql);
      const scope: Scope = {
        teacherId: 'a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9',
        classId: 'b9b9b9b9-b9b9-4b9b-8b9b-b9b9b9b9b9b9',
        studentId: 'c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9',
        assignmentId: 'd9d9d9d9-d9d9-4d9d-8d9d-d9d9d9d9d9d9',
        submissionId: 'e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9',
      };
      const now = Date.now();

      await cleanup(scope.teacherId);
      await seedSubmissionScope(scope, now);

      // First accepted request: "delete all materials" (target_type =
      // 'materials', target_id = the assignment's own id).
      const first = await repo.createDeletionOperation({
        teacherId: scope.teacherId,
        targetType: 'materials',
        targetId: scope.assignmentId,
        storageKeys: [],
      });
      expect(first.target_type).toBe('materials');

      // A concurrent "delete the whole assignment" request races in before
      // cleanup finishes; it shares the same target_id and collides on
      // `idx_deletion_operations_pending_target` (unique on target_id alone).
      try {
        await repo.createDeletionOperation({
          teacherId: scope.teacherId,
          targetType: 'assignment',
          targetId: scope.assignmentId,
          storageKeys: [],
        });
        throw new Error('expected DeletionScopeConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(DeletionScopeConflictError);
        expect((error as InstanceType<typeof DeletionScopeConflictError>).existing.target_type).toBe('materials');
        expect((error as InstanceType<typeof DeletionScopeConflictError>).existing.id).toBe(first.id);
      }

      await cleanup(scope.teacherId);
    },
  );
});
