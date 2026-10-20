import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import postgres from 'postgres';
import { createDb } from '../src/lib/db';
import { DeletionRepository, MAX_ATTEMPTS_PER_KEY } from '../src/db/deletion.repository';
import { DeletionService } from '../src/deletion/deletion.service';

/**
 * Integration proof for the review fixes (TASK-006): runs the real
 * DeletionService — real SQL through postgres.js against a live Postgres —
 * through a full class scope: pages with cascaded child rows, a materials
 * version, submissions, and a student. Requires a local Postgres seeded with
 * database/migrations/*.sql (see scripts/migrate.sh). Skipped when no
 * DATABASE_URL is provided so `pnpm test` stays green in CI.
 */

const connectionString = process.env.AR_TEST_DATABASE_URL;
const d = connectionString
  ? describe
  : (name: string, _fn: () => void) =>
      it.skip(`${name} (set AR_TEST_DATABASE_URL to run)`, () => {});

d('integration: cleanup pipeline against live Postgres', () => {
  let sql: postgres.Sql;

  beforeEach(() => {
    sql = postgres(connectionString, { prepare: false, max: 2 });
  });

  afterEach(async () => {
    await sql.end();
  });

  const seedScope = async (
    ids: { teacherId: string; classId: string; studentId: string; assignmentId: string; materialsId: string; pageId: string },
  ): Promise<void> => {
    const now = Date.now();
    await sql.begin(async (tx) => {
      await tx`insert into public.users (id, email, password_hash) values (${ids.teacherId}, 'it@t.test', 'x')`;
      await tx`insert into public.classes (id, teacher_id, name, created_at_ms, updated_at_ms) values (${ids.classId}, ${ids.teacherId}, 'C', ${now}, ${now})`;
      await tx`insert into public.students (id, class_id, teacher_id, name, created_at_ms, updated_at_ms) values (${ids.studentId}, ${ids.classId}, ${ids.teacherId}, 'S', ${now}, ${now})`;
      await tx`insert into public.assignments (id, class_id, teacher_id, name, created_at_ms, updated_at_ms) values (${ids.assignmentId}, ${ids.classId}, ${ids.teacherId}, 'A', ${now}, ${now})`;
      await tx`insert into public.assignment_material_versions (id, assignment_id, teacher_id, version, lifecycle, created_at_ms, updated_at_ms) values (${ids.materialsId}, ${ids.assignmentId}, ${ids.teacherId}, 1, 'current', ${now}, ${now})`;
      await tx`insert into public.pages (id, document_type, materials_version_id, class_id, assignment_id, teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
        values (${ids.pageId}, 'materials', ${ids.materialsId}, ${ids.classId}, ${ids.assignmentId}, ${ids.teacherId}, 1, 'P', 'it/' || ${ids.pageId} || '.jpg', 'uploading', ${now}, ${now}, ${now})`;
    });
  };

  const cleanupScope = async (teacherId: string): Promise<void> => {
    await sql`delete from public.users where id = ${teacherId}`;
  };

  const seedOperationWithKeys = async (
    operationId: string,
    teacherId: string,
    pageId: string,
    keys: Array<{ key: string; status: 'pending' | 'failed'; attempts?: number }>,
  ): Promise<void> => {
    const now = Date.now();
    await sql`insert into public.deletion_operations (id, teacher_id, target_type, target_id, status, accepted_at_ms, updated_at_ms)
      values (${operationId}, ${teacherId}, 'page', ${pageId}, 'pending', ${now}, ${now})`;
    for (const [index, object] of keys.entries()) {
      await sql`insert into public.deletion_objects (id, operation_id, storage_key, status, attempts, created_at_ms)
        values (md5(${operationId} || ${index})::uuid, ${operationId}, ${object.key}, ${object.status}, ${object.attempts ?? 0}, ${now})`;
    }
  };

  it(
    'deletes a whole class scope leaf-first, finalizes, and replays as a no-op',
    { timeout: 30000 },
    async () => {
      const teacherId = '11111111-1111-4111-8111-111111111111';
      const classId = '22222222-2222-4222-8222-222222222222';
      const assignmentId = '33333333-3333-4333-8333-333333333333';
      const studentId = '44444444-4444-4444-8444-444444444444';
      const materialsId = '55555555-5555-4555-8555-555555555555';
      const submissionId = '66666666-6666-4666-8666-666666666666';
      const operationId = '99999999-9999-4999-8999-999999999999';

      // Idempotent seed: drop any residue from a previous run first.
      await sql`delete from public.users where id = ${teacherId}`;
      await sql.begin(async (tx) => {
        await tx`insert into public.users (id, email, password_hash) values (${teacherId}, 't@t.test', 'x')`;
        await tx`insert into public.classes (id, teacher_id, name, created_at_ms, updated_at_ms) values (${classId}, ${teacherId}, 'C', 1, 1)`;
        await tx`insert into public.assignments (id, class_id, teacher_id, name, created_at_ms, updated_at_ms) values (${assignmentId}, ${classId}, ${teacherId}, 'A', 1, 1)`;
        await tx`insert into public.students (id, class_id, teacher_id, name, created_at_ms, updated_at_ms) values (${studentId}, ${classId}, ${teacherId}, 'S', 1, 1)`;
        await tx`insert into public.assignment_material_versions (id, assignment_id, teacher_id, version, lifecycle, created_at_ms, updated_at_ms) values (${materialsId}, ${assignmentId}, ${teacherId}, 1, 'current', 1, 1)`;
        // 20 pages across materials (fix for the position-uniqueness bug).
        await tx`insert into public.pages (document_type, materials_version_id, class_id, assignment_id, teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
          select 'materials', ${materialsId}, ${classId}, ${assignmentId}, ${teacherId}, p, 'p' || p,
            'teacher/t1/class/c/assignment/a/materials/' || md5(p::text) || '.jpg',
            'uploading', 1, 1, 1
          from generate_series(1, 20) as p`;
        await tx`insert into public.submissions (id, assignment_id, class_id, student_id, teacher_id, created_at_ms, updated_at_ms) values (${submissionId}, ${assignmentId}, ${classId}, ${studentId}, ${teacherId}, 1, 1)`;
        await tx`insert into public.pages (document_type, submission_id, student_id, class_id, assignment_id, teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
          values ('submission', ${submissionId}, ${studentId}, ${classId}, ${assignmentId}, ${teacherId}, 1, 's1',
            'teacher/t1/class/c/assignment/a/submission/sub1.jpg', 'uploading', 1, 1, 1)`;
        // Cascade child rows on the first materials page.
        await tx`insert into public.question_segments (page_id, page_revision, ordinal, created_at_ms)
          select id, 1, 1, 1 from public.pages where document_type = 'materials' and position = 1`;
        await tx`insert into public.transcription_attempts (page_id, page_revision, document_type, model, attempt, queued_at_ms, started_at_ms, ended_at_ms, latency_ms, outcome, created_at_ms)
          select id, 1, 'materials', 'm', 1, 1, 2, 3, 1, 'failed', 1 from public.pages where document_type = 'materials' and position = 1`;
        // Durable operation + per-key objects.
        await tx`insert into public.deletion_operations (id, teacher_id, target_type, target_id, status, accepted_at_ms, updated_at_ms)
          values (${operationId}, ${teacherId}, 'class', ${classId}, 'pending', 1, 1)`;
        await tx`insert into public.deletion_objects (id, operation_id, storage_key, status, attempts, created_at_ms)
          select md5(${operationId} || p::text)::uuid, ${operationId}::uuid,
            'teacher/t1/class/c/assignment/a/materials/' || md5(p::text) || '.jpg', 'pending', 0, 1
          from generate_series(1, 20) as p`;
      });

      const deletedKeys: string[] = [];
      const bucket = { delete: async (key: string) => { deletedKeys.push(key); } };

      const repository = new DeletionRepository(createDb({ HYPERDRIVE: { connectionString } as never }));
      const service = new DeletionService(repository, bucket);

      // First run: full pipeline.
      const firstOutcome = await service.processOperation(operationId);
      expect(firstOutcome).toBe('completed');

      // 20 R2 keys deleted, once each.
      expect(deletedKeys).toHaveLength(20);
      expect(new Set(deletedKeys).size).toBe(20);

      // Relational truth: everything in the class scope is gone.
      const rows = await sql`
        select
          (select count(*) from public.classes where id = ${classId}::uuid) as classes,
          (select count(*) from public.students where class_id = ${classId}::uuid) as students,
          (select count(*) from public.assignments where class_id = ${assignmentId}::uuid) as assignments,
          (select count(*) from public.assignment_material_versions where id = ${materialsId}::uuid) as materials,
          (select count(*) from public.submissions where id = ${submissionId}::uuid) as submissions,
          (select count(*) from public.pages where class_id = ${classId}::uuid) as pages,
          (select count(*) from public.question_segments where page_id in (select id from public.pages where class_id = ${classId}::uuid)) as segments,
          (select count(*) from public.transcription_attempts where page_id in (select id from public.pages where class_id = ${classId}::uuid)) as attempts,
          (select count(*) from public.deletion_objects where operation_id = ${operationId}::uuid and status <> 'completed') as objects_remaining
      `;
      const totals = rows[0] as Record<string, number | string>;
      expect(Number(totals.classes)).toBe(0);
      expect(Number(totals.students)).toBe(0);
      expect(Number(totals.assignments)).toBe(0);
      expect(Number(totals.materials)).toBe(0);
      expect(Number(totals.submissions)).toBe(0);
      expect(Number(totals.pages)).toBe(0);
      expect(Number(totals.segments)).toBe(0);
      expect(Number(totals.attempts)).toBe(0);
      expect(Number(totals.objects_remaining)).toBe(0);

      // Replay: the settled operation is a no-op.
      const replay = await service.processOperation(operationId);
      expect(replay).toBe('no_op');

      // Cleanup teacher row.
      await sql`delete from public.users where id = ${teacherId}`;
    },
  );

  it(
    'never finalizes after a key hard-fails on an earlier delivery (BUG-1 regression)',
    { timeout: 30000 },
    async () => {
      // The key row is already hard-failed from a previous redelivery, so the
      // service sees no deletable keys. Finalization must refuse: the page row
      // survives and the operation stays pending for operator recovery.
      const ids = {
        teacherId: '17171717-1717-4717-8717-171717171717',
        classId: '27272727-2727-4727-8727-272727272727',
        studentId: '37373737-3737-4737-8737-373737373737',
        assignmentId: '47474747-4747-4747-8747-474747474747',
        materialsId: '57575757-5757-4757-8757-575757575757',
        pageId: '67676767-6767-4767-8767-676767676767',
      };
      const operationId = '87878787-8787-4787-8787-878787878787';
      await seedScope(ids);
      const pageKey = 'it/' + ids.pageId + '.jpg';
      await seedOperationWithKeys(operationId, ids.teacherId, ids.pageId, [
        { key: pageKey, status: 'failed', attempts: MAX_ATTEMPTS_PER_KEY },
      ]);

      const deletedKeys: string[] = [];
      const repository = new DeletionRepository(createDb({ HYPERDRIVE: { connectionString } as never }));
      const service = new DeletionService(repository, {
        delete: async (key: string) => {
          deletedKeys.push(key);
        },
      } as never);

      const outcome = await service.processOperation(operationId);

      expect(outcome).toBe('incomplete');
      expect(deletedKeys).toHaveLength(0); // nothing deletable, nothing deleted
      const pageLeft = await sql`select count(*)::int as n from public.pages where id = ${ids.pageId}`;
      expect(Number(pageLeft[0]!.n)).toBe(1); // relational row NOT orphan-deleted
      const opRow = await sql`select status from public.deletion_operations where id = ${operationId}`;
      expect(opRow[0]!.status).toBe('pending');
      const outstanding = await sql`select count(*)::int as n from public.deletion_objects where operation_id = ${operationId} and status <> 'completed'`;
      expect(Number(outstanding[0]!.n)).toBe(1);

      await cleanupScope(ids.teacherId);
    },
  );

  it(
    'drains an operation with more keys than one batch before finalizing (BUG-2 regression)',
    { timeout: 60000 },
    async () => {
      // 1001 pending keys: a single-batch consumer finalized with 1 key left
      // pending and the target already deleted. The service must keep loading
      // batches until the pending set is empty, then finalize exactly once.
      const ids = {
        teacherId: '18181818-1818-4818-8818-181818181818',
        classId: '28282828-2828-4828-8828-282828282828',
        studentId: '38383838-3838-4838-8838-383838383838',
        assignmentId: '48484848-4848-4848-8848-484848484848',
        materialsId: '58585858-5858-4858-8858-585858585858',
        pageId: '68686868-6868-4868-8868-686868686868',
      };
      const operationId = '88888888-8888-4888-8888-888888888888';
      await seedScope(ids);
      const now = Date.now();
      await sql`insert into public.deletion_operations (id, teacher_id, target_type, target_id, status, accepted_at_ms, updated_at_ms)
        values (${operationId}, ${ids.teacherId}, 'page', ${ids.pageId}, 'pending', ${now}, ${now})`;
      await sql`insert into public.deletion_objects (id, operation_id, storage_key, status, attempts, created_at_ms)
        select md5(${operationId} || g::text)::uuid, ${operationId}, 'it/batch/' || g || '.jpg', 'pending', 0, ${now}
        from generate_series(1, 1001) as g`;

      const deletedKeys: string[] = [];
      const repository = new DeletionRepository(createDb({ HYPERDRIVE: { connectionString } as never }));
      const service = new DeletionService(repository, {
        delete: async (key: string) => {
          deletedKeys.push(key);
        },
      } as never);

      const outcome = await service.processOperation(operationId);

      expect(outcome).toBe('completed');
      expect(deletedKeys).toHaveLength(1001);
      expect(new Set(deletedKeys).size).toBe(1001); // every key exactly once
      const opRow = await sql`select status from public.deletion_operations where id = ${operationId}`;
      expect(opRow[0]!.status).toBe('completed');
      const pendingLeft = await sql`select count(*)::int as n from public.deletion_objects where operation_id = ${operationId} and status <> 'completed'`;
      expect(Number(pendingLeft[0]!.n)).toBe(0);
      const pageLeft = await sql`select count(*)::int as n from public.pages where id = ${ids.pageId}`;
      expect(Number(pageLeft[0]!.n)).toBe(0);

      await cleanupScope(ids.teacherId);
    },
  );
});
