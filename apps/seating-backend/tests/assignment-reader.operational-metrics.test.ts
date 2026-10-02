import { afterEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import {
  getConversionMetrics,
  getLatencyAndFailureMetrics,
  getMaterialsAdoptionMetrics,
  getPagesEverEditedMetrics,
} from '../src/assignment-reader/operational-metrics.repository';

/**
 * Integration proof for the TASK-027 operational-metrics queries: real SQL
 * (aggregates, `filter`, `percentile_disc`) against a live Postgres, not a
 * fake — the thing worth pinning here is that the queries themselves are
 * valid and return the right shape, which an in-memory fake cannot prove.
 * Requires a local Postgres seeded with database/migrations/*.sql (see
 * scripts/migrate.sh). Skipped when AR_TEST_DATABASE_URL is unset so
 * `pnpm test` stays green locally; CI (.github/workflows/ci.yml) provides
 * it against a migrated service database.
 */

const connectionString = process.env.AR_TEST_DATABASE_URL;
const d = connectionString
  ? describe
  : (name: string, _fn: () => void) =>
      it.skip(`${name} (set AR_TEST_DATABASE_URL to run)`, () => {});

d('integration: operational metrics against live Postgres', () => {
  let sql: postgres.Sql;

  afterEach(async () => {
    await sql?.end();
  });

  it('computes latency/failure, conversion, edit, and adoption metrics by document type and model', async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    const now = Date.now();
    const sinceMs = now - 60_000;

    // Random per run (rather than fixed fixture ids) so a re-run against a
    // non-ephemeral local Postgres never collides with a prior run's rows,
    // and a model name unique to this run so the latency/failure lookup
    // below can never match another suite's fixture row.
    const teacherId = crypto.randomUUID();
    const classId = crypto.randomUUID();
    const studentId = crypto.randomUUID();
    const assignmentId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const materialVersionId = crypto.randomUUID();
    const pageSubmissionId = crypto.randomUUID();
    const pageMaterialsId = crypto.randomUUID();
    const model = `test-model-${crypto.randomUUID()}`;

    // getConversionMetrics/getMaterialsAdoptionMetrics/getPagesEverEditedMetrics
    // are intentionally global aggregates (never teacher-scoped — see the
    // module doc comment), so another suite's fixture rows inside the same
    // `sinceMs` window are indistinguishable from this test's own at the
    // query layer. Snapshotting the "before" count and asserting the exact
    // delta this one fixture insert produces keeps the assertions correct
    // regardless of what else is in the table.
    const conversionBefore = await getConversionMetrics(sql, sinceMs);
    const adoptionBefore = await getMaterialsAdoptionMetrics(sql, sinceMs);
    const editsBefore = await getPagesEverEditedMetrics(sql, sinceMs);
    const editedBefore = (documentType: 'materials' | 'submission') =>
      editsBefore.find((row) => row.documentType === documentType) ?? {
        documentType,
        totalPages: 0,
        editedPages: 0,
      };

    await sql.begin(async (tx) => {
      await tx`insert into public.users (id, email, password_hash) values (${teacherId}, ${teacherId + '@t.test'}, 'x')`;
      await tx`insert into public.classes (id, teacher_id, name, created_at_ms, updated_at_ms)
        values (${classId}, ${teacherId}, 'C', ${now}, ${now})`;
      await tx`insert into public.students (id, class_id, teacher_id, name, created_at_ms, updated_at_ms)
        values (${studentId}, ${classId}, ${teacherId}, 'S', ${now}, ${now})`;
      await tx`insert into public.assignments (id, class_id, teacher_id, name, created_at_ms, updated_at_ms)
        values (${assignmentId}, ${classId}, ${teacherId}, 'A', ${now}, ${now})`;
      await tx`insert into public.assignment_material_versions
          (id, assignment_id, teacher_id, version, lifecycle, document_revision, draft_confirmed, confirmed_at_ms, created_at_ms, updated_at_ms)
        values (${materialVersionId}, ${assignmentId}, ${teacherId}, 1, 'current', 1, true, ${now}, ${now}, ${now})`;
      await tx`insert into public.submissions
          (id, assignment_id, class_id, student_id, teacher_id, draft_confirmed, confirmed_at_ms, review_state, grading_state, graded_at_ms, created_at_ms, updated_at_ms)
        values (${submissionId}, ${assignmentId}, ${classId}, ${studentId}, ${teacherId}, true, ${now}, 'ready_to_grade', 'graded', ${now}, ${now}, ${now})`;
      await tx`insert into public.pages
          (id, document_type, submission_id, student_id, class_id, assignment_id, teacher_id,
           position, label, storage_key, processing_state, attempt_count, page_revision,
           edited_by_teacher, draft, uploaded_at_ms, created_at_ms, updated_at_ms)
        values (${pageSubmissionId}, 'submission', ${submissionId}, ${studentId}, ${classId}, ${assignmentId}, ${teacherId},
           1, 'Page', 'it/' || ${pageSubmissionId} || '.jpg', 'completed', 1, 1,
           true, '{}'::jsonb, ${now}, ${now}, ${now})`;
      await tx`insert into public.pages
          (id, document_type, materials_version_id, class_id, assignment_id, teacher_id,
           position, label, storage_key, processing_state, attempt_count, page_revision,
           edited_by_teacher, draft, uploaded_at_ms, created_at_ms, updated_at_ms)
        values (${pageMaterialsId}, 'materials', ${materialVersionId}, ${classId}, ${assignmentId}, ${teacherId},
           1, 'Page', 'it/' || ${pageMaterialsId} || '.jpg', 'completed', 1, 1,
           false, '{}'::jsonb, ${now}, ${now}, ${now})`;
      await tx`insert into public.transcription_attempts
          (id, page_id, page_revision, document_type, model, attempt, queued_at_ms, started_at_ms, ended_at_ms,
           latency_ms, outcome, cost_usd, cost_source, is_retry, created_at_ms)
        values
          (gen_random_uuid(), ${pageSubmissionId}, 1, 'submission', ${model}, 1, ${now}, ${now}, ${now},
           1000, 'completed', 0.001, 'provider_reported', false, ${now}),
          (gen_random_uuid(), ${pageSubmissionId}, 1, 'submission', ${model}, 2, ${now}, ${now}, ${now},
           2000, 'failed', null, 'unavailable', true, ${now})`;
    });

    const latency = await getLatencyAndFailureMetrics(sql, sinceMs);
    const submissionRow = latency.find((row) => row.documentType === 'submission' && row.model === model);
    expect(submissionRow).toMatchObject({
      attempts: 2,
      completed: 1,
      failed: 1,
      retried: 1,
      avgLatencyMs: 1500,
      costUnavailableCount: 1,
    });

    const conversionAfter = await getConversionMetrics(sql, sinceMs);
    expect(conversionAfter).toEqual({
      totalSubmissions: conversionBefore.totalSubmissions + 1,
      readyToGrade: conversionBefore.readyToGrade + 1,
      graded: conversionBefore.graded + 1,
    });

    const adoptionAfter = await getMaterialsAdoptionMetrics(sql, sinceMs);
    expect(adoptionAfter).toEqual({
      totalAssignments: adoptionBefore.totalAssignments + 1,
      assignmentsWithConfirmedMaterials: adoptionBefore.assignmentsWithConfirmedMaterials + 1,
    });

    const editsAfter = await getPagesEverEditedMetrics(sql, sinceMs);
    const submissionEditsBefore = editedBefore('submission');
    const materialsEditsBefore = editedBefore('materials');
    expect(editsAfter.find((row) => row.documentType === 'submission')).toEqual({
      documentType: 'submission',
      totalPages: submissionEditsBefore.totalPages + 1,
      editedPages: submissionEditsBefore.editedPages + 1,
    });
    expect(editsAfter.find((row) => row.documentType === 'materials')).toEqual({
      documentType: 'materials',
      totalPages: materialsEditsBefore.totalPages + 1,
      editedPages: materialsEditsBefore.editedPages,
    });
  });
});
