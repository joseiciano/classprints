-- TASK-009 (api-routes-hierarchy.md §2.9): saving is idempotent for
-- (class_id, source_job_external_id) — a second result from the same job
-- replays the originally saved snapshot rather than inserting a second one.
-- The Phase 2 index keyed on (class_id, source_job_external_id,
-- source_result_id) allowed exactly that second insert, so it is replaced.
drop index if exists public.idx_saved_seating_charts_source;
create unique index if not exists idx_saved_seating_charts_source
  on public.saved_seating_charts(class_id, source_job_external_id);
