-- TASK-004 follow-up: the original 20260923090000 migration created the page
-- position uniqueness indexes on the parent id alone instead of
-- (parent_id, position), which made multi-page documents impossible: the
-- second page of any materials version or submission violated
-- idx_pages_materials_position_unique / idx_pages_submission_position_unique
-- regardless of its position.
--
-- Databases that applied the original file keep its broken index until this
-- migration replaces both. Replay is idempotent (IF EXISTS / IF NOT EXISTS);
-- concurrent page inserts are protected by the ledger in scripts/migrate.sh,
-- which applies files in filename order under one runner.

drop index if exists public.idx_pages_materials_position_unique;
drop index if exists public.idx_pages_submission_position_unique;

create unique index if not exists idx_pages_materials_position_unique
  on public.pages(materials_version_id, position) where materials_version_id is not null;
create unique index if not exists idx_pages_submission_position_unique
  on public.pages(submission_id, position) where submission_id is not null;
