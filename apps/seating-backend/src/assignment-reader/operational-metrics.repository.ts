import type { Sql } from '../lib/db';

/**
 * Operational metrics (TASK-027, REQ-025). These are cross-tenant
 * aggregates for staging/production operability — never scoped to one
 * teacher — so unlike every other function in this module they are never
 * wired behind an HTTP route: adding a teacher-authenticated endpoint that
 * returns platform-wide aggregates would be a new cross-tenant data
 * exposure for no operational benefit. An operator runs these directly
 * (see `scripts/print-operational-metrics.ts` and CONTRIBUTING.md's
 * "Operational queries" section) against the service database.
 *
 * Every value here comes from `transcription_attempts`/`pages`/
 * `submissions`/`assignment_material_versions` timestamps, counts, and
 * enums — never from `pages.draft`, `question_segments`, or any other
 * column that could carry student/teacher content (SEC-003).
 */

export interface LatencyFailureMetricsRow {
  documentType: 'materials' | 'submission';
  model: string;
  attempts: number;
  completed: number;
  failed: number;
  retried: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  avgCostUsd: number | null;
  costUnavailableCount: number;
}

/** Upload-to-draft latency and failure/retry rate (REQ-025), by document
 * type and model, over attempts created at or after `sinceMs`. */
export const getLatencyAndFailureMetrics = async (
  sql: Sql,
  sinceMs: number,
): Promise<LatencyFailureMetricsRow[]> => {
  const rows = await sql<
    {
      document_type: 'materials' | 'submission';
      model: string;
      attempts: number;
      completed: number;
      failed: number;
      retried: number;
      avg_latency_ms: number | null;
      p95_latency_ms: number | null;
      avg_cost_usd: number | null;
      cost_unavailable_count: number;
    }[]
  >`
    select
      document_type,
      model,
      count(*)::int as attempts,
      count(*) filter (where outcome = 'completed')::int as completed,
      count(*) filter (where outcome = 'failed')::int as failed,
      count(*) filter (where is_retry)::int as retried,
      avg(latency_ms)::float as avg_latency_ms,
      percentile_disc(0.95) within group (order by latency_ms)::float as p95_latency_ms,
      avg(cost_usd)::float as avg_cost_usd,
      count(*) filter (where cost_source = 'unavailable')::int as cost_unavailable_count
    from transcription_attempts
    where created_at_ms >= ${sinceMs}
    group by document_type, model
    order by document_type, model
  `;
  return rows.map((row) => ({
    documentType: row.document_type,
    model: row.model,
    attempts: row.attempts,
    completed: row.completed,
    failed: row.failed,
    retried: row.retried,
    avgLatencyMs: row.avg_latency_ms,
    p95LatencyMs: row.p95_latency_ms,
    avgCostUsd: row.avg_cost_usd,
    costUnavailableCount: row.cost_unavailable_count,
  }));
};

export interface ConversionMetrics {
  totalSubmissions: number;
  readyToGrade: number;
  graded: number;
}

/** Ready/graded conversion (REQ-025), across every submission created at
 * or after `sinceMs`. Not grouped by model — grading is a teacher action,
 * not a transcription one. */
export const getConversionMetrics = async (sql: Sql, sinceMs: number): Promise<ConversionMetrics> => {
  const rows = await sql<{ total: number; ready_to_grade: number; graded: number }[]>`
    select
      count(*)::int as total,
      count(*) filter (where review_state = 'ready_to_grade')::int as ready_to_grade,
      count(*) filter (where grading_state = 'graded')::int as graded
    from submissions
    where created_at_ms >= ${sinceMs}
  `;
  const row = rows[0] ?? { total: 0, ready_to_grade: 0, graded: 0 };
  return { totalSubmissions: row.total, readyToGrade: row.ready_to_grade, graded: row.graded };
};

export interface PagesEverEditedRow {
  documentType: 'materials' | 'submission';
  totalPages: number;
  editedPages: number;
}

/** The MVP correction metric (TASK-027): "pages ever edited", not edit
 * magnitude or correctness. Scoped to completed pages uploaded at or after
 * `sinceMs`, grouped by document type. */
export const getPagesEverEditedMetrics = async (
  sql: Sql,
  sinceMs: number,
): Promise<PagesEverEditedRow[]> => {
  const rows = await sql<
    { document_type: 'materials' | 'submission'; total_pages: number; edited_pages: number }[]
  >`
    select
      document_type,
      count(*)::int as total_pages,
      count(*) filter (where edited_by_teacher)::int as edited_pages
    from pages
    where processing_state = 'completed' and uploaded_at_ms >= ${sinceMs}
    group by document_type
    order by document_type
  `;
  return rows.map((row) => ({
    documentType: row.document_type,
    totalPages: row.total_pages,
    editedPages: row.edited_pages,
  }));
};

export interface MaterialsAdoptionMetrics {
  totalAssignments: number;
  assignmentsWithConfirmedMaterials: number;
}

/** Materials adoption (REQ-025's "materials adoption/open rate" baseline —
 * the open-rate half lives in Analytics Engine's `materials_open` events,
 * see CONTRIBUTING.md). The percentage of assignments created at or after
 * `sinceMs` that have a confirmed current material version. */
export const getMaterialsAdoptionMetrics = async (
  sql: Sql,
  sinceMs: number,
): Promise<MaterialsAdoptionMetrics> => {
  const rows = await sql<{ total: number; with_materials: number }[]>`
    select
      count(*)::int as total,
      count(*) filter (
        where exists (
          select 1 from assignment_material_versions v
          where v.assignment_id = a.id and v.lifecycle = 'current' and v.draft_confirmed
        )
      )::int as with_materials
    from assignments a
    where a.created_at_ms >= ${sinceMs}
  `;
  const row = rows[0] ?? { total: 0, with_materials: 0 };
  return { totalAssignments: row.total, assignmentsWithConfirmedMaterials: row.with_materials };
};
