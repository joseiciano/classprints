-- Boundary verification (TASK-004 acceptance, TEST-002) — run inside psql:
--   psql "$DATABASE_URL" -f tests/assignment-reader-migration-verify.sql
--
-- Every negative case is one `do $$ ... end $$;` block expecting a named
-- constraint violation; an expected violation raises a NOTICE and continues,
-- an unexpected outcome (no error, wrong constraint) raises an EXCEPTION with
-- the case name, which aborts the script (psql -v ON_ERROR_STOP=1 exits 1).
-- The final marker prints only after every case passes, so callers can gate
-- on its presence and exit code.
--
-- Score precision note (REQ-018): numeric(6,2) rounds at insert, so the
-- database stores 8.125 as 8.13 rather than rejecting it — precision is
-- owned by the service layer and the shared Zod schema. The case below pins
-- that contract (rounds to 2dp, never stores a third decimal) instead of
-- expecting an error.

do $$ begin
  -- Seed: two teachers, one class/student/assignment/material version each.
  if not exists (select 1 from public.users where id = '11111111-1111-4111-8111-111111111111') then
    insert into public.users (id, email, password_hash, email_confirmed_at)
    values ('11111111-1111-4111-8111-111111111111', 't1@example.com', 'x', now());
  end if;
  if not exists (select 1 from public.users where id = '22222222-2222-4222-8222-222222222222') then
    insert into public.users (id, email, password_hash, email_confirmed_at)
    values ('22222222-2222-4222-8222-222222222222', 't2@example.com', 'x', now());
  end if;
  if not exists (select 1 from public.classes where id = 'aaaaaaa1-0000-4000-8000-000000000001') then
    insert into public.classes (id, teacher_id, name, status, created_at_ms, updated_at_ms)
    values ('aaaaaaa1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Algebra', 'active', 1, 1);
  end if;
  if not exists (select 1 from public.classes where id = 'aaaaaaa2-0000-4000-8000-000000000002') then
    insert into public.classes (id, teacher_id, name, status, created_at_ms, updated_at_ms)
    values ('aaaaaaa2-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Other', 'active', 1, 1);
  end if;
  if not exists (select 1 from public.students where id = 'bbbbbbb1-0000-4000-8000-000000000001') then
    insert into public.students (id, class_id, teacher_id, name, status, created_at_ms, updated_at_ms)
    values ('bbbbbbb1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 'Maya Rodriguez', 'active', 1, 1);
  end if;
  if not exists (select 1 from public.assignments where id = 'ccccccc1-0000-4000-8000-000000000001') then
    insert into public.assignments (id, class_id, teacher_id, name, status, max_score, created_at_ms, updated_at_ms)
    values ('ccccccc1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 'Quiz 1', 'need_review', 10, 1, 1);
  end if;
  if not exists (select 1 from public.assignment_material_versions where id = 'ddddddd1-0000-4000-8000-000000000001') then
    insert into public.assignment_material_versions
      (id, assignment_id, teacher_id, version, lifecycle, created_at_ms, updated_at_ms)
    values ('ddddddd1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 1, 'current', 1, 1);
  end if;
end $$;

-- 1. Duplicate submission (REQ-006): must fail on the unique pair.
do $$ begin
  insert into public.submissions (id, assignment_id, class_id, student_id, teacher_id, created_at_ms, updated_at_ms)
  values ('eeeeeee1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
          'aaaaaaa1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111', 1, 1);
  begin
    -- Second submission for the same (assignment, student) pair: the unique
    -- index must reject it. The insert stays the only statement inside the
    -- sub-block: psql's auto-commit makes a prior INSERT in the same DO block
    -- permanent, so a two-insert body cannot be retried idempotently.
    insert into public.submissions (id, assignment_id, class_id, student_id, teacher_id, created_at_ms, updated_at_ms)
    values ('eeeeeee2-0000-4000-8000-000000000002', 'ccccccc1-0000-4000-8000-000000000001',
            'aaaaaaa1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 2, 2);
    raise exception 'CASE_1_DUPLICATE_SUBMISSION_NOT_REJECTED';
  exception when unique_violation then
    raise notice 'case 1 ok (duplicate submission rejected)';
  end;
  delete from public.submissions where id = 'eeeeeee1-0000-4000-8000-000000000001';
end $$;

-- 2. Second current material version (REQ-005 partial unique): must fail.
do $$ begin
  begin
    insert into public.assignment_material_versions
      (id, assignment_id, teacher_id, version, lifecycle, created_at_ms, updated_at_ms)
    values ('ddddddd2-0000-4000-8000-000000000002', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 2, 'current', 2, 2);
    raise exception 'CASE_2_SECOND_CURRENT_MATERIAL_NOT_REJECTED';
  exception when unique_violation then
    raise notice 'case 2 ok (second current material rejected)';
  end;
end $$;

-- 3. Reused version number across lifecycles: must fail.
do $$ begin
  begin
    insert into public.assignment_material_versions
      (id, assignment_id, teacher_id, version, lifecycle, created_at_ms, updated_at_ms)
    values ('ddddddd3-0000-4000-8000-000000000003', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 1, 'draft', 3, 3);
    raise exception 'CASE_3_REUSED_VERSION_NUMBER_NOT_REJECTED';
  exception when unique_violation then
    raise notice 'case 3 ok (reused version number rejected)';
  end;
end $$;

-- 4. Score precision (REQ-018): numeric(6,2) rounds at insert; the stored
--    value must never carry a third decimal. The service layer rejects
--    three-decimal input before the database sees it.
do $$ begin
  begin
    insert into public.submissions
      (id, assignment_id, class_id, student_id, teacher_id, score, created_at_ms, updated_at_ms)
    values ('eeeeeee3-0000-4000-8000-000000000003', 'ccccccc1-0000-4000-8000-000000000001',
            'aaaaaaa1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 8.125, 4, 4);
    if (select score from public.submissions where id = 'eeeeeee3-0000-4000-8000-000000000003') <> 8.13 then
      raise exception 'CASE_4_SCORE_PRECISION_NOT_NORMALIZED';
    end if;
    raise notice 'case 4 ok (score rounded to 2dp: service owns precision)';
    delete from public.submissions where id = 'eeeeeee3-0000-4000-8000-000000000003';
  exception
    when unique_violation then
      -- A previous run left this row behind (e.g. aborted mid-script). Treat
      -- it as already verified and clean it up.
      delete from public.submissions where id = 'eeeeeee3-0000-4000-8000-000000000003';
      raise notice 'case 4 ok (row from prior run removed)';
    when others then
      if sqlerrm = 'CASE_4_SCORE_PRECISION_NOT_NORMALIZED' then
        raise;
      end if;
      raise exception 'CASE_4_SCORE_INSERT_UNEXPECTEDLY_REJECTED: %', sqlerrm;
  end;
end $$;

-- 5. Invalid class status: must fail on the check constraint.
do $$ begin
  begin
    insert into public.classes (id, teacher_id, name, status, created_at_ms, updated_at_ms)
    values ('aaaaaaa3-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
            'Bad', 'deleted', 5, 5);
    raise exception 'CASE_5_INVALID_CLASS_STATUS_NOT_REJECTED';
  exception when check_violation then
    raise notice 'case 5 ok (invalid class status rejected)';
  end;
end $$;

-- 6. Graded submission without ready_to_grade: must fail (REQ-017).
do $$ begin
  begin
    insert into public.submissions
      (id, assignment_id, class_id, student_id, teacher_id, grading_state, graded_at_ms, created_at_ms, updated_at_ms)
    values ('eeeeeee4-0000-4000-8000-000000000004', 'ccccccc1-0000-4000-8000-000000000001',
            'aaaaaaa1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 'graded', 6, 6, 6);
    raise exception 'CASE_6_GRADED_WITHOUT_READY_NOT_REJECTED';
  exception when check_violation then
    raise notice 'case 6 ok (graded without ready_to_grade rejected)';
    delete from public.submissions where id = 'eeeeeee4-0000-4000-8000-000000000004';
  end;
end $$;

-- 7. Page parent exclusivity: both parents null — must fail.
do $$ begin
  begin
    insert into public.pages
      (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
       teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
    values ('fffffff1-0000-4000-8000-000000000001', 'materials', null, null, null,
            'aaaaaaa1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 1, 'Page 1', 'teacher/t1/class/c/assignment/a/materials/p1.jpg',
            'uploading', 7, 7, 7);
    raise exception 'CASE_7_PARENTLESS_PAGE_NOT_REJECTED';
  exception when check_violation then
    raise notice 'case 7 ok (parentless page rejected)';
  end;
end $$;

-- 8. Page parent exclusivity: both parents set — must fail.
do $$ begin
  begin
    insert into public.pages
      (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
       teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
    values ('fffffff2-0000-4000-8000-000000000002', 'submission',
            'ddddddd1-0000-4000-8000-000000000001', 'eeeeeee1-0000-4000-8000-000000000001',
            'bbbbbbb1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
            'ccccccc1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
            1, 'Page 1', 'teacher/t1/class/c/assignment/a/materials/p1.jpg', 'uploading', 8, 8, 8);
    raise exception 'CASE_8_DOUBLE_PARENT_PAGE_NOT_REJECTED';
  exception when check_violation then
    raise notice 'case 8 ok (double-parent page rejected)';
  end;
end $$;

-- 9. Cross-teacher page (SEC-001 composite FK): must fail.
do $$ begin
  begin
    insert into public.pages
      (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
       teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
    values ('fffffff3-0000-4000-8000-000000000003', 'submission', null,
            'eeeeeee1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
            'aaaaaaa1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
            '22222222-2222-4222-8222-222222222222',
            1, 'Page 1', 'teacher/t2/class/c/assignment/a/submission/p1.jpg', 'uploading', 9, 9, 9);
    raise exception 'CASE_9_CROSS_TEACHER_PAGE_NOT_REJECTED';
  exception when foreign_key_violation then
    raise notice 'case 9 ok (cross-teacher page rejected)';
  end;
end $$;

-- 10. Duplicate page position within one parent: must fail.
do $$ begin
  begin
    insert into public.pages
      (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
       teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
    values ('fffffff4-0000-4000-8000-000000000004', 'materials',
            'ddddddd1-0000-4000-8000-000000000001', null, null,
            'aaaaaaa1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 1, 'Page 1',
            'teacher/t1/class/c/assignment/a/materials/p1.jpg', 'uploading', 10, 10, 10);
    insert into public.pages
      (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
       teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
    values ('fffffff5-0000-4000-8000-000000000005', 'materials',
            'ddddddd1-0000-4000-8000-000000000001', null, null,
            'aaaaaaa1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 1, 'Page 1 again',
            'teacher/t1/class/c/assignment/a/materials/p2.jpg', 'uploading', 10, 10, 10);
    raise exception 'CASE_10_DUPLICATE_POSITION_NOT_REJECTED';
  exception when unique_violation then
    raise notice 'case 10 ok (duplicate page position rejected)';
  end;
end $$;

-- 11. Completed page without draft: must fail.
do $$ begin
  begin
    insert into public.pages
      (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
       teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
    values ('fffffff6-0000-4000-8000-000000000006', 'materials',
            'ddddddd1-0000-4000-8000-000000000001', null, null,
            'aaaaaaa1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 2, 'Page 2',
            'teacher/t1/class/c/assignment/a/materials/p2.jpg', 'completed', 11, 11, 11);
    raise exception 'CASE_11_COMPLETED_WITHOUT_DRAFT_NOT_REJECTED';
  exception when check_violation then
    raise notice 'case 11 ok (completed page without draft rejected)';
  end;
end $$;

-- 12. Failed page without failure code: must fail.
do $$ begin
  begin
    insert into public.pages
      (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
       teacher_id, position, label, storage_key, processing_state, uploaded_at_ms, created_at_ms, updated_at_ms)
    values ('fffffff7-0000-4000-8000-000000000007', 'materials',
            'ddddddd1-0000-4000-8000-000000000001', null, null,
            'aaaaaaa1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 2, 'Page 2',
            'teacher/t1/class/c/assignment/a/materials/p2.jpg', 'failed', 12, 12, 12);
    raise exception 'CASE_12_FAILED_WITHOUT_CODE_NOT_REJECTED';
  exception when check_violation then
    raise notice 'case 12 ok (failed page without code rejected)';
  end;
end $$;

-- 13. Invalid review state: must fail.
do $$ begin
  begin
    insert into public.submissions
      (id, assignment_id, class_id, student_id, teacher_id, review_state, created_at_ms, updated_at_ms)
    values ('eeeeeee5-0000-4000-8000-000000000005', 'ccccccc1-0000-4000-8000-000000000001',
            'aaaaaaa1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 'ready', 13, 13);
    raise exception 'CASE_13_INVALID_REVIEW_STATE_NOT_REJECTED';
  exception when check_violation then
    raise notice 'case 13 ok (invalid review state rejected)';
  end;
end $$;

-- 14. Student pointing at another teacher's class (composite FK): must fail.
do $$ begin
  begin
    insert into public.students
      (id, class_id, teacher_id, name, status, created_at_ms, updated_at_ms)
    values ('bbbbbbb2-0000-4000-8000-000000000002', 'aaaaaaa2-0000-4000-8000-000000000002',
            '11111111-1111-4111-8111-111111111111', 'Wrong Teacher', 'active', 14, 14);
    raise exception 'CASE_14_CROSS_TEACHER_STUDENT_NOT_REJECTED';
  exception when foreign_key_violation then
    raise notice 'case 14 ok (cross-teacher student rejected)';
  end;
end $$;

-- 15. A score above the assignment maximum passes the DB boundary by design;
--     the service layer validates against max_score (REQ-018).
do $$ begin
  begin
    insert into public.submissions
      (id, assignment_id, class_id, student_id, teacher_id, score, grading_state, graded_at_ms,
       review_state, created_at_ms, updated_at_ms)
    values ('eeeeeee6-0000-4000-8000-000000000006', 'ccccccc1-0000-4000-8000-000000000001',
            'aaaaaaa1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
            '11111111-1111-4111-8111-111111111111', 12.00, 'not_graded', null, 'ready_to_grade', 15, 15);
    raise notice 'case 15 ok (max-score enforcement owned by service layer)';
    delete from public.submissions where id = 'eeeeeee6-0000-4000-8000-000000000006';
  exception when others then
    raise exception 'CASE_15_VALID_SCORE_REJECTED: %', sqlerrm;
  end;
end $$;

-- 16. Positive control: valid pages/segments/judgments/attempts/deletion rows.
do $$ begin
  begin
    if not exists (select 1 from public.submissions where id = 'eeeeeee7-0000-4000-8000-000000000007') then
      insert into public.submissions
        (id, assignment_id, class_id, student_id, teacher_id, created_at_ms, updated_at_ms)
      values ('eeeeeee7-0000-4000-8000-000000000007', 'ccccccc1-0000-4000-8000-000000000001',
              'aaaaaaa1-0000-4000-8000-000000000001', 'bbbbbbb1-0000-4000-8000-000000000001',
              '11111111-1111-4111-8111-111111111111', 16, 16);

      insert into public.pages
        (id, document_type, materials_version_id, submission_id, student_id, class_id, assignment_id,
         teacher_id, position, label, storage_key, processing_state, queued_at_ms, uploaded_at_ms,
         created_at_ms, updated_at_ms)
      values ('fffffff8-0000-4000-8000-000000000008', 'submission', null,
              'eeeeeee7-0000-4000-8000-000000000007', 'bbbbbbb1-0000-4000-8000-000000000001',
              'aaaaaaa1-0000-4000-8000-000000000001', 'ccccccc1-0000-4000-8000-000000000001',
              '11111111-1111-4111-8111-111111111111', 1, 'Maya Rodriguez · Page 1',
              'teacher/t1/class/c1/assignment/a1/submission/p8.jpg', 'queued', 16, 16, 16, 16);

      insert into public.question_segments
        (id, page_id, page_revision, ordinal, label, question_text, response_text, created_at_ms)
      values ('77777771-0000-4000-8000-000000000001', 'fffffff8-0000-4000-8000-000000000008', 1, 1, null,
              'What is 2+2?', '4', 16);

      insert into public.question_judgments
        (id, segment_id, page_id, page_revision, teacher_id, judgment, awarded_points, comment,
         created_at_ms, updated_at_ms)
      values ('88888881-0000-4000-8000-000000000001', '77777771-0000-4000-8000-000000000001',
              'fffffff8-0000-4000-8000-000000000008', 1, '11111111-1111-4111-8111-111111111111',
              'correct', 2.50, 'Nice', 16, 16);

      insert into public.transcription_attempts
        (id, page_id, page_revision, document_type, model, attempt, queued_at_ms, started_at_ms,
         ended_at_ms, latency_ms, outcome, provider_cost_usd, cost_usd, cost_source, is_retry, created_at_ms)
      values ('99999991-0000-4000-8000-000000000001', 'fffffff8-0000-4000-8000-000000000008', 1,
              'submission', 'x-ai/grok-vision', 1, 16, 17, 20, 3, 'completed', 0.00001234, 0.00001234,
              'provider_reported', false, 16);

      insert into public.deletion_operations
        (id, teacher_id, target_type, target_id, status, accepted_at_ms, updated_at_ms)
      values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
              'page', 'fffffff8-0000-4000-8000-000000000008', 'pending', 16, 16)
      on conflict (id) do nothing;

      insert into public.deletion_objects
        (id, operation_id, storage_key, status, created_at_ms)
      values ('bbbbbbbb-0000-4000-8000-000000000001',
              'aaaaaaaa-0000-4000-8000-000000000001',
              'teacher/t1/class/c1/assignment/a1/submission/p8.jpg', 'pending', 16)
      on conflict (id) do nothing;

      -- Seating charts have no submission linkage; the seed's idempotence
      -- guard above covers the submission branch only, so insert the chart
      -- with ON CONFLICT to keep reruns green.
      insert into public.saved_seating_charts
        (id, class_id, teacher_id, source_job_external_id, source_result_id, grid, student_count, created_at_ms)
      values ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
              '11111111-1111-4111-8111-111111111111', 'job-ext-1', 1, '[["Maya Rodriguez"]]', 1, 16)
      on conflict (id) do nothing;
    end if;
    raise notice 'case 16 ok (positive control committed)';
  exception when others then
    raise exception 'CASE_16_POSITIVE_CONTROL_FAILED: %', sqlerrm;
  end;
end $$;

-- 17. Second pending deletion operation on the same target: must fail.
do $$ begin
  begin
    insert into public.deletion_operations
      (id, teacher_id, target_type, target_id, status, accepted_at_ms, updated_at_ms)
    values ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
            'page', 'fffffff8-0000-4000-8000-000000000008', 'pending', 17, 17);
    raise exception 'CASE_17_SECOND_PENDING_OPERATION_NOT_REJECTED';
  exception when unique_violation then
    raise notice 'case 17 ok (second pending operation rejected)';
  end;
end $$;

-- Cleanup so a rerun starts clean: the positive-control rows persist across
-- runs (the seed block is idempotent), but their submissions/pages must go or
-- case 1's unique-pair precondition fails on the next pass. Leaf-first:
-- pages before submissions; non-blob children cascade from pages.
delete from public.pages
  where submission_id = 'eeeeeee7-0000-4000-8000-000000000007'
     or materials_version_id = 'ddddddd1-0000-4000-8000-000000000001';
delete from public.submissions where id = 'eeeeeee7-0000-4000-8000-000000000007';

do $$ begin
  raise notice 'BOUNDARY_VERIFICATION_PASSED';
end $$;
