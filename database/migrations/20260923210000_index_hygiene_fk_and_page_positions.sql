-- Index hygiene follow-up (TASK-004 review, TEST-002): two composite foreign
-- keys lacked a child-side index ("index every foreign key"), and two
-- non-unique page-position indexes were fully redundant with the partial
-- unique indexes on identical columns/rows (pure write amplification).
-- Replay is idempotent (IF EXISTS / IF NOT EXISTS); migrate.sh serializes
-- under one runner, so concurrent CREATE INDEX is not a concern here.

-- Missing FK indexes: submissions(class_id) and pages(student_id) back the
-- composite FKs submissions_class_teacher_fk and pages_student_teacher_fk.
create index if not exists idx_submissions_class
  on public.submissions(class_id);
create index if not exists idx_pages_student
  on public.pages(student_id);

-- Redundant: these plain indexes duplicate the partial unique indexes
-- idx_pages_materials_position_unique / idx_pages_submission_position_unique
-- (20260923200000_fix_page_position_unique_indexes.sql) on the same columns
-- over the same rows. Queries keep using the unique indexes.
drop index if exists public.idx_pages_materials_position;
drop index if exists public.idx_pages_submission_position;
