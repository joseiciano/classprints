-- Assignment Reader MVP schema (TASK-004; plan §2 Phase 2).
-- Requires: public.users (see 20260207000000_create_users.sql).
--
-- Conventions follow the existing seating tables: UUID primary keys
-- (gen_random_uuid()), bigint millisecond timestamps, JSONB payloads.
--
-- No relational cascades for records that own R2 keys (pages and their
-- ancestors): destructive services create deletion rows first (REQ-022) and
-- cleanup finalizes relational removal (TASK-006/TASK-018). Non-blob
-- descendants (page_reviews, question_segments, question_judgments,
-- transcription_attempts, deletion_objects) use on delete cascade because
-- they have no storage identity of their own.
--
-- Boundary deviations (deliberate, enforced in service/shared-schema code):
--  * Score/points precision: numeric(6,2) rounds at insert, so
--    score = round(score, 2) cannot reject a third decimal — REQ-018's
--    two-decimal rule is owned by the service layer and the shared Zod
--    schema; the DB check pins non-negativity and the 2dp storage shape.
--  * Score vs assignment max: max_score lives on the assignment row, so a
--    cross-row CHECK is impossible at this boundary; the service validates
--    score <= max_score (REQ-018).
--  * Normalized crop coordinates ([0,1]) live inside the draft JSONB
--    (PAT-001), not in table columns; the shared content schema rejects
--    out-of-range values at every API/provider boundary.
--  * Draft page identity inside imageRegion nodes is likewise validated by
--    the shared schema, not by a database constraint.
--
-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  name text not null constraint classes_name_len check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' constraint classes_status_enum check (status in ('active', 'archived')),
  archived_at_ms bigint,
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);

comment on column public.classes.status is 'ClassStatus enum: active | archived (REQ-021; unarchive out of scope).';

create unique index if not exists idx_classes_id_teacher on public.classes(id, teacher_id);
create index if not exists idx_classes_teacher_created on public.classes(teacher_id, created_at_ms desc, id);
create index if not exists idx_classes_teacher_status_created on public.classes(teacher_id, status, created_at_ms desc, id);
create index if not exists idx_classes_teacher_name on public.classes(teacher_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- students (roster records; never authentication identities — REQ-001)
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  teacher_id uuid not null references public.users(id) on delete cascade,
  name text not null constraint students_name_len check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' constraint students_status_enum check (status in ('active', 'removed')),
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  removed_at_ms bigint,
  constraint students_removed_state check (
    (status = 'active' and removed_at_ms is null) or (status = 'removed' and removed_at_ms is not null)
  ),
  constraint students_class_teacher_fk
    foreign key (class_id, teacher_id) references public.classes(id, teacher_id)
);

create unique index if not exists idx_students_id_teacher on public.students(id, teacher_id);
create index if not exists idx_students_class_created on public.students(class_id, created_at_ms desc, id);
create index if not exists idx_students_class_status_created on public.students(class_id, status, created_at_ms desc, id);
create index if not exists idx_students_class_name on public.students(class_id, lower(btrim(name)));
create index if not exists idx_students_teacher on public.students(teacher_id);

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  teacher_id uuid not null references public.users(id) on delete cascade,
  name text not null constraint assignments_name_len check (char_length(btrim(name)) between 1 and 200),
  -- PAT-003 aggregate, materialized and kept current by the service layer.
  status text not null default 'need_review' constraint assignments_status_enum check (status in ('need_review', 'graded')),
  max_score numeric(6, 2) constraint assignments_max_score check (
    max_score is null or (max_score >= 0 and max_score = round(max_score, 2))
  ),
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  constraint assignments_class_teacher_fk
    foreign key (class_id, teacher_id) references public.classes(id, teacher_id)
);

create unique index if not exists idx_assignments_id_teacher on public.assignments(id, teacher_id);
create index if not exists idx_assignments_class_created on public.assignments(class_id, created_at_ms desc, id);
create index if not exists idx_assignments_class_status_created
  on public.assignments(class_id, status, created_at_ms desc, id);
create index if not exists idx_assignments_class_name on public.assignments(class_id, lower(btrim(name)));
create index if not exists idx_assignments_teacher on public.assignments(teacher_id);

-- ---------------------------------------------------------------------------
-- assignment_material_versions (REQ-004/REQ-005)
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_material_versions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  teacher_id uuid not null references public.users(id) on delete cascade,
  version integer not null constraint amv_version_positive check (version >= 1),
  lifecycle text not null constraint amv_lifecycle_enum check (lifecycle in ('draft', 'current', 'historical')),
  document_revision integer not null default 1 constraint amv_document_revision check (document_revision >= 1),
  draft_confirmed boolean not null default false,
  confirmed_at_ms bigint,
  replaced_at_ms bigint,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  constraint amv_confirmed_shape check (
    (draft_confirmed = false and confirmed_at_ms is null)
    or (draft_confirmed = true and confirmed_at_ms is not null)
  ),
  constraint amv_historical_replaced check (
    lifecycle <> 'historical' or replaced_at_ms is not null
  ),
  constraint amv_current_not_replaced check (
    lifecycle <> 'current' or replaced_at_ms is null
  ),
  constraint amv_assignment_teacher_fk
    foreign key (assignment_id, teacher_id) references public.assignments(id, teacher_id)
);

create unique index if not exists idx_amv_id_teacher on public.assignment_material_versions(id, teacher_id);
-- Exactly one current version per assignment (REQ-005); draft+historical may coexist.
create unique index if not exists idx_amv_current_per_assignment
  on public.assignment_material_versions(assignment_id) where lifecycle = 'current';
-- Unique material (assignment_id, version) across all lifecycles.
create unique index if not exists idx_amv_assignment_version
  on public.assignment_material_versions(assignment_id, version);
-- Historical version reads and draft lookup.
create index if not exists idx_amv_assignment_lifecycle_created
  on public.assignment_material_versions(assignment_id, lifecycle, created_at_ms desc, id);
create index if not exists idx_amv_teacher on public.assignment_material_versions(teacher_id);

-- ---------------------------------------------------------------------------
-- submissions (REQ-006: one per student per assignment)
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null references public.users(id) on delete cascade,
  document_revision integer not null default 1 constraint submissions_document_revision check (document_revision >= 1),
  draft_confirmed boolean not null default false,
  confirmed_at_ms bigint,
  review_state text constraint submissions_review_state_enum check (review_state in ('needs_review', 'ready_to_grade')),
  grading_state text not null default 'not_graded' constraint submissions_grading_state_enum check (grading_state in ('not_graded', 'graded')),
  score numeric(6, 2) constraint submissions_score_shape check (
    score is null or (score >= 0 and score = round(score, 2))
  ),
  comments text constraint submissions_comments_len check (comments is null or char_length(comments) <= 4000),
  materials_version_id uuid,
  review_context_captured_at_ms bigint,
  graded_at_ms bigint,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  constraint submissions_confirmed_shape check (
    (draft_confirmed = false and confirmed_at_ms is null)
    or (draft_confirmed = true and confirmed_at_ms is not null)
  ),
  constraint submissions_grade_shape check (
    (grading_state = 'not_graded' and graded_at_ms is null)
    or (grading_state = 'graded' and graded_at_ms is not null)
  ),
  -- REQ-017: graded only from ready_to_grade; a NULL review_state (no pages
  -- recorded yet) can never coexist with graded.
  constraint submissions_review_grade_order check (
    grading_state = 'not_graded' or (review_state is not null and review_state = 'ready_to_grade' and graded_at_ms is not null)
  ),
  -- REQ-006 uniqueness + ownership through composite FKs.
  constraint submissions_assignment_teacher_fk
    foreign key (assignment_id, teacher_id) references public.assignments(id, teacher_id),
  constraint submissions_student_teacher_fk
    foreign key (student_id, teacher_id) references public.students(id, teacher_id),
  constraint submissions_class_teacher_fk
    foreign key (class_id, teacher_id) references public.classes(id, teacher_id),
  -- Null in any FK column skips enforcement, so a null materials version is fine.
  constraint submissions_material_teacher_fk
    foreign key (materials_version_id, teacher_id)
    references public.assignment_material_versions(id, teacher_id)
);

create unique index if not exists idx_submissions_id_teacher on public.submissions(id, teacher_id);
create unique index if not exists idx_submissions_assignment_student
  on public.submissions(assignment_id, student_id);
create index if not exists idx_submissions_assignment_created
  on public.submissions(assignment_id, created_at_ms desc, id);
create index if not exists idx_submissions_assignment_grading_created
  on public.submissions(assignment_id, grading_state, created_at_ms desc, id);
create index if not exists idx_submissions_student on public.submissions(student_id);
create index if not exists idx_submissions_teacher on public.submissions(teacher_id);
create index if not exists idx_submissions_materials_version on public.submissions(materials_version_id);

-- ---------------------------------------------------------------------------
-- pages (REQ-009: per-page states; immutable identity; position ordering)
-- ---------------------------------------------------------------------------
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  document_type text not null constraint pages_document_type_enum check (document_type in ('materials', 'submission')),
  materials_version_id uuid,
  submission_id uuid,
  student_id uuid,
  class_id uuid not null,
  assignment_id uuid not null,
  teacher_id uuid not null references public.users(id) on delete cascade,
  position integer not null constraint pages_position_positive check (position >= 1),
  label text not null constraint pages_label_len check (char_length(label) between 1 and 200),
  -- REQ-020 key: teacher/{t}/class/{c}/assignment/{a}/{type}/{pageId}.jpg.
  storage_key text not null constraint pages_storage_key_shape check (char_length(storage_key) between 1 and 500),
  processing_state text not null constraint pages_processing_state_enum check (
    processing_state in ('uploading', 'queued', 'transcribing', 'completed', 'failed')
  ),
  attempt_count integer not null default 0 constraint pages_attempt_count check (attempt_count >= 0),
  page_revision integer not null default 1 constraint pages_page_revision check (page_revision >= 1),
  content_revision integer not null default 0 constraint pages_content_revision check (content_revision >= 0),
  reviewed_content_revision integer constraint pages_reviewed_revision check (reviewed_content_revision >= 0),
  reviewed_at_ms bigint,
  edited_by_teacher boolean not null default false,
  teacher_edit_count integer not null default 0 constraint pages_teacher_edit_count check (teacher_edit_count >= 0),
  -- PAT-001 wrapper: {"schemaVersion":1,"doc":{...}} — 1 MiB budget.
  draft jsonb constraint pages_draft_budget check (pg_column_size(draft) <= 1048576),
  failure_code text constraint pages_failure_code_enum check (
    failure_code in ('provider_timeout', 'provider_rejected', 'invalid_output', 'storage_failure', 'invalid_image')
  ),
  failure_message text,
  queued_at_ms bigint,
  started_at_ms bigint,
  completed_at_ms bigint,
  uploaded_at_ms bigint not null,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  -- Page parent exclusivity: exactly one of materials_version_id / submission_id.
  constraint pages_parent_exclusive check (
    (materials_version_id is null) <> (submission_id is null)
  ),
  constraint pages_materials_type_shape check (
    document_type <> 'materials' or (submission_id is null and student_id is null)
  ),
  constraint pages_reviewed_shape check (
    (reviewed_content_revision is null and reviewed_at_ms is null)
    or (reviewed_content_revision is not null and reviewed_at_ms is not null)
  ),
  constraint pages_completed_has_content check (
    processing_state <> 'completed' or draft is not null
  ),
  constraint pages_failed_shape check (
    processing_state <> 'failed' or failure_code is not null
  ),
  constraint pages_failed_message_shape check (
    failure_code is null or failure_message is not null
  ),
  constraint pages_timing_shape check (
    (queued_at_ms is null and started_at_ms is null and completed_at_ms is null)
    or (queued_at_ms is not null and completed_at_ms is null and started_at_ms is null)
    or (queued_at_ms is not null and completed_at_ms is null and started_at_ms is not null)
    or (queued_at_ms is not null and completed_at_ms is not null and started_at_ms is not null)
  ),
  constraint pages_class_teacher_fk
    foreign key (class_id, teacher_id) references public.classes(id, teacher_id),
  constraint pages_assignment_teacher_fk
    foreign key (assignment_id, teacher_id) references public.assignments(id, teacher_id),
  constraint pages_materials_teacher_fk
    foreign key (materials_version_id, teacher_id)
    references public.assignment_material_versions(id, teacher_id),
  constraint pages_submission_teacher_fk
    foreign key (submission_id, teacher_id) references public.submissions(id, teacher_id),
  constraint pages_student_teacher_fk
    foreign key (student_id, teacher_id) references public.students(id, teacher_id)
);

create unique index if not exists idx_pages_id_teacher on public.pages(id, teacher_id);
create index if not exists idx_pages_materials_position
  on public.pages(materials_version_id, position);
create index if not exists idx_pages_submission_position
  on public.pages(submission_id, position);
create index if not exists idx_pages_materials_state
  on public.pages(materials_version_id, processing_state, position);
create index if not exists idx_pages_submission_state
  on public.pages(submission_id, processing_state, position);
create index if not exists idx_pages_teacher on public.pages(teacher_id);
create index if not exists idx_pages_assignment on public.pages(assignment_id);
create index if not exists idx_pages_class on public.pages(class_id);

-- Unique (parent, position) within each parent (materials and submission
-- pages); partial so a row with only the other parent kind is unaffected.
create unique index if not exists idx_pages_materials_position_unique
  on public.pages(materials_version_id, position) where materials_version_id is not null;
create unique index if not exists idx_pages_submission_position_unique
  on public.pages(submission_id, position) where submission_id is not null;

-- ---------------------------------------------------------------------------
-- page_reviews (REQ-016: review record per current page revision)
-- ---------------------------------------------------------------------------
create table if not exists public.page_reviews (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  page_revision integer not null constraint page_reviews_page_revision check (page_revision >= 1),
  content_revision integer not null constraint page_reviews_content_revision check (content_revision >= 0),
  reviewed_at_ms bigint not null,
  created_at_ms bigint not null
);

create index if not exists idx_page_reviews_page_revision
  on public.page_reviews(page_id, page_revision, reviewed_at_ms desc);
create index if not exists idx_page_reviews_page_content
  on public.page_reviews(page_id, content_revision);

-- ---------------------------------------------------------------------------
-- question_segments (REQ-019/PAT-004: parsed rows per page transcription revision)
-- ---------------------------------------------------------------------------
create table if not exists public.question_segments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  page_revision integer not null constraint question_segments_page_revision check (page_revision >= 1),
  ordinal integer not null constraint question_segments_ordinal check (ordinal >= 1),
  label text constraint question_segments_label_len check (label is null or char_length(label) <= 200),
  question_text text constraint question_segments_question_len check (
    question_text is null or char_length(question_text) <= 20000
  ),
  response_text text constraint question_segments_response_len check (
    response_text is null or char_length(response_text) <= 20000
  ),
  created_at_ms bigint not null
);

create index if not exists idx_question_segments_page_revision
  on public.question_segments(page_id, page_revision, ordinal);
-- One segment payload per page/revision ordinal.
create unique index if not exists idx_question_segments_page_revision_ordinal
  on public.question_segments(page_id, page_revision, ordinal);

-- ---------------------------------------------------------------------------
-- question_judgments (REQ-019: teacher-owned; stored separately from segments)
-- ---------------------------------------------------------------------------
create table if not exists public.question_judgments (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.question_segments(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  page_revision integer not null constraint question_judgments_page_revision check (page_revision >= 1),
  teacher_id uuid not null references public.users(id) on delete cascade,
  judgment text not null constraint question_judgments_value_enum check (judgment in ('unmarked', 'correct', 'incorrect')),
  awarded_points numeric(6, 2) constraint question_judgments_points_shape check (
    awarded_points is null or (awarded_points >= 0 and awarded_points = round(awarded_points, 2))
  ),
  comment text constraint question_judgments_comment_len check (comment is null or char_length(comment) <= 2000),
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);

-- One teacher judgment per segment within its page/revision.
create unique index if not exists idx_question_judgments_segment
  on public.question_judgments(segment_id, page_id, page_revision);
create index if not exists idx_question_judgments_page_revision
  on public.question_judgments(page_id, page_revision);
create index if not exists idx_question_judgments_teacher on public.question_judgments(teacher_id);

-- ---------------------------------------------------------------------------
-- transcription_attempts (REQ-025: per-page attempt audit)
-- ---------------------------------------------------------------------------
create table if not exists public.transcription_attempts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  page_revision integer not null constraint transcription_attempts_page_revision check (page_revision >= 1),
  document_type text not null constraint transcription_attempts_document_type_enum check (
    document_type in ('materials', 'submission')
  ),
  model text not null constraint transcription_attempts_model_len check (char_length(model) between 1 and 200),
  attempt integer not null constraint transcription_attempts_attempt check (attempt >= 1),
  queued_at_ms bigint not null,
  started_at_ms bigint not null,
  ended_at_ms bigint not null,
  latency_ms bigint not null constraint transcription_attempts_latency check (latency_ms >= 0),
  outcome text not null constraint transcription_attempts_outcome_enum check (outcome in ('completed', 'failed', 'retry')),
  failure_code text constraint transcription_attempts_failure_code_enum check (
    failure_code in ('provider_timeout', 'provider_rejected', 'invalid_output', 'storage_failure', 'invalid_image')
  ),
  provider_prompt_tokens bigint constraint transcription_attempts_tokens_nonneg check (provider_prompt_tokens >= 0),
  provider_completion_tokens bigint constraint transcription_attempts_completion_nonneg check (provider_completion_tokens >= 0),
  provider_total_tokens bigint constraint transcription_attempts_total_nonneg check (provider_total_tokens >= 0),
  provider_cost_usd numeric(18, 8) constraint transcription_attempts_provider_cost check (
    provider_cost_usd is null or provider_cost_usd >= 0
  ),
  -- Normalized cost estimate and its calculation source (REQ-025).
  cost_usd numeric(18, 8) constraint transcription_attempts_cost_shape check (
    cost_usd is null or (cost_usd >= 0 and cost_usd < 1000000)
  ),
  cost_source text constraint transcription_attempts_cost_source_enum check (
    cost_source in ('provider_reported', 'token_estimate', 'unavailable')
  ),
  is_retry boolean not null default false,
  created_at_ms bigint not null
);

create index if not exists idx_transcription_attempts_page_revision
  on public.transcription_attempts(page_id, page_revision, attempt);
create index if not exists idx_transcription_attempts_document_type
  on public.transcription_attempts(document_type, ended_at_ms desc);
create index if not exists idx_transcription_attempts_model
  on public.transcription_attempts(model, ended_at_ms desc);

-- ---------------------------------------------------------------------------
-- saved_seating_charts (REQ-023)
-- ---------------------------------------------------------------------------
create table if not exists public.saved_seating_charts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  teacher_id uuid not null references public.users(id) on delete cascade,
  source_job_external_id text not null,
  source_result_id bigint not null constraint saved_seating_charts_source_result check (source_result_id >= 0),
  grid jsonb not null constraint saved_seating_charts_grid check (jsonb_typeof(grid) = 'array'),
  student_count integer not null constraint saved_seating_charts_student_count check (student_count >= 0),
  created_at_ms bigint not null,
  constraint saved_seating_charts_class_teacher_fk
    foreign key (class_id, teacher_id) references public.classes(id, teacher_id)
);

-- Unique save target per (class, source job) per hierarchy contract §2.9;
-- migration 20260926000000 drops and re-creates this index without
-- source_result_id. Kept here in its corrected shape for fresh installs.
create unique index if not exists idx_saved_seating_charts_source
  on public.saved_seating_charts(class_id, source_job_external_id);
create index if not exists idx_saved_seating_charts_class_created
  on public.saved_seating_charts(class_id, created_at_ms desc, id);
create index if not exists idx_saved_seating_charts_teacher on public.saved_seating_charts(teacher_id);

-- ---------------------------------------------------------------------------
-- deletion_operations (REQ-022: durable cross-store deletion)
-- ---------------------------------------------------------------------------
create table if not exists public.deletion_operations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  target_type text not null constraint deletion_operations_target_type_enum check (
    target_type in ('page', 'materials', 'submission', 'student_data', 'assignment', 'class', 'account')
  ),
  target_id uuid not null,
  status text not null default 'pending' constraint deletion_operations_status_enum check (status in ('pending', 'completed', 'failed')),
  accepted_at_ms bigint not null,
  updated_at_ms bigint not null,
  failure_code text
);

create unique index if not exists idx_deletion_operations_pending_target
  on public.deletion_operations(target_id) where status = 'pending';
create index if not exists idx_deletion_operations_status
  on public.deletion_operations(status, accepted_at_ms);
create index if not exists idx_deletion_operations_teacher
  on public.deletion_operations(teacher_id, accepted_at_ms desc);

-- ---------------------------------------------------------------------------
-- deletion_objects (per-key ledger driving the cleanup consumer; replay-safe)
-- ---------------------------------------------------------------------------
create table if not exists public.deletion_objects (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.deletion_operations(id) on delete cascade,
  storage_key text not null constraint deletion_objects_key_shape check (char_length(storage_key) between 1 and 500),
  status text not null default 'pending' constraint deletion_objects_status_enum check (status in ('pending', 'completed', 'failed')),
  attempts integer not null default 0 constraint deletion_objects_attempts check (attempts >= 0),
  last_error text,
  created_at_ms bigint not null,
  completed_at_ms bigint
);

create index if not exists idx_deletion_objects_operation_status
  on public.deletion_objects(operation_id, status);
create index if not exists idx_deletion_objects_pending_batch
  on public.deletion_objects(operation_id, created_at_ms) where status = 'pending';
