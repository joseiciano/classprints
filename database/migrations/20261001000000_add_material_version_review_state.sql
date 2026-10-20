-- Ticket 6 (TASK-016) follow-up: assignment_material_versions never gained a
-- review_state column in the original schema, even though both the
-- transcriber worker (apps/assignment-worker/src/db/transcription.repository.ts
-- persistCompletion, REQ-011) and the Phase 5 retry/retranscription paths
-- (apps/seating-backend assignment-reader.repository.ts retryPageRow,
-- retranscribeDocumentRows) already write `review_state = 'needs_review'` /
-- `review_state = null` to this table. Without this column those writes were
-- silently rejected by Postgres (unknown column), so this migration closes a
-- pre-existing gap rather than introducing a new one.
--
-- Shape mirrors submissions.review_state (REQ-016/REQ-017): nullable,
-- 'needs_review' | 'ready_to_grade'. Materials carry no grading_state, so
-- there is no analogous submissions_review_grade_order constraint here.

alter table public.assignment_material_versions
  add column if not exists review_state text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'amv_review_state_enum'
  ) then
    alter table public.assignment_material_versions
      add constraint amv_review_state_enum
      check (review_state in ('needs_review', 'ready_to_grade'));
  end if;
end $$;

comment on column public.assignment_material_versions.review_state is
  'ReviewState enum: needs_review | ready_to_grade | null (REQ-011/REQ-016).';
