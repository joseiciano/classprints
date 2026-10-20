---
ticket: 2
phase: "Implementation Phase 2"
goal: GOAL-002
status: Complete
date_created: 2026-10-01
---

# Ticket 2: Build persistence and infrastructure foundations

![Status: Complete](https://img.shields.io/badge/status-Complete-brightgreen)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on [Ticket 1](1-freeze-contracts-and-launch-gates.md) (TASK-001, TASK-002).

**GOAL-002**: Provide durable relational, object-storage, queue, binding, and deployment foundations for every Assignment Reader lifecycle.

## Tasks

- [x] **TASK-004**: Add `database/migrations/20260923090000_create_assignment_reader.sql` with complete constraints and indexes.
  - Create `classes`, `students`, `assignments`, `assignment_material_versions`, `submissions`, `pages`, `page_reviews`, `question_segments`, `question_judgments`, `transcription_attempts`, `saved_seating_charts`, `deletion_operations`, and `deletion_objects`.
  - Use UUID primary keys, existing `public.users(id)` ownership, bigint millisecond timestamps to match the repository, `numeric(...,2)` for score/points, `numeric(18,8)` for per-attempt cost, JSONB for versioned editor nodes, per-page/per-revision question-segment arrays, and grid snapshots, plus check constraints for enums, score precision/range, normalized crop data, page parent exclusivity, and page position.
  - Enforce unique `(assignment_id, student_id)`, unique material `(assignment_id, version)`, one current material version per assignment with a partial unique index, unique page position within its parent, one question-segment payload per page/revision, one teacher judgment per segment ID within that page/revision, and unique saved chart source per class/job.
  - Index every foreign key and primary list predicate: teacher/status/date for classes; class/status/date for students and assignments; assignment/status/date for submissions/materials; parent/position and processing state for pages; operation/status for deletion rows; page/revision for attempts/segment payloads/judgments/reviews.
  - Do not rely on relational cascades alone for records containing R2 keys: destructive services first create deletion rows and mark the scope pending, then [Ticket 6](6-review-grading-and-deletion-apis.md) TASK-018 finalizes relational deletion after R2 success.
  - Dependencies: TASK-001 and TASK-002 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)).
  - Acceptance: `sh scripts/migrate.sh` applies the migration to an isolated Postgres database; replay is idempotent; invalid parent combinations, duplicate submissions/current materials, invalid scores, and invalid states fail at the database boundary.

- [x] **TASK-005**: Provision and bind storage, image, and queue resources in both environments.
  - Extend `scripts/bootstrap.sh` with `assignment-reader-staging|production` R2 buckets and `transcription-jobs`, `transcription-jobs-dlq`, `document-cleanup-jobs`, and `document-cleanup-jobs-dlq`; retain idempotent check-before-create behavior.
  - Extend `apps/seating-backend/wrangler.jsonc` in both top-level staging and `env.production` with `ASSIGNMENT_IMAGES` R2, `IMAGES`, `TRANSCRIPTION_JOBS`, and `DOCUMENT_CLEANUP_JOBS` bindings.
  - Generate Wrangler binding declarations and adapt `apps/seating-backend/src/types/env.ts` to compose the generated bindings with Hono variables rather than adding unverified handwritten platform types.
  - Acceptance: Wrangler dry-run resolves identical binding names in staging and production; bootstrap replay creates no duplicate resource; R2 has no public development URL or custom public domain.

- [x] **TASK-006**: Create the dedicated transcriber/cleanup Worker at `apps/assignment-worker`.
  - Add `package.json`, `tsconfig.json`, `wrangler.jsonc`, generated binding declarations, `src/index.ts`, `src/types.ts`, `src/transcription/`, `src/deletion/`, `src/db/`, and `tests/`.
  - Deploy as `classprints-transcriber`; bind Hyperdrive, `ASSIGNMENT_IMAGES` R2, `IMAGES`, Analytics Engine, `transcription-jobs` + DLQ, and `document-cleanup-jobs` + DLQ in both environments.
  - Configure transcription consumption with `max_batch_size: 1`, `max_batch_timeout: 1`, `max_retries: 3`, and bounded concurrency 5. Acknowledge/retry each message explicitly so one failed vision call never redelivers an acknowledged page.
  - Implement the generic cleanup consumer in `src/deletion/deletion.service.ts` and `src/db/deletion.repository.ts`: lock an operation, delete pending R2 keys in batches of at most 1000, mark each key complete, then finalize relational deletion. Replay must skip completed keys and resume partial failures.
  - Require `LLM_API_KEY`, `TRANSCRIPTION_MODEL`, and comma-separated `TRANSCRIPTION_FALLBACK_MODELS`; do not hardcode a teacher-visible or source-code fallback model.
  - Extend `.github/workflows/deploy.yml` to reconcile and deploy the worker after migrations and before the frontend; retain the established staging-default/production-explicit convention.
  - Dependencies: TASK-001 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)), TASK-004, and TASK-005 (this ticket).
  - Acceptance: package-scoped typecheck/test/dry-run commands pass in both Wrangler environments; a synthetic transcription message reaches the worker without mutating a document; and a seeded cleanup operation completes, then replays as a no-op after an injected partial failure.

## Phase Completion Criteria

Migration, R2, Images, queues, generated bindings, worker deploy, and CI ordering are proven in staging and dry-run cleanly for production.

## Dependencies

- Requires [Ticket 1](1-freeze-contracts-and-launch-gates.md) (TASK-001, TASK-002) complete.
- Unblocks [Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md), [Ticket 4](4-upload-and-authenticated-image-delivery.md), [Ticket 5](5-transcription-retry-and-progress-services.md), and [Ticket 6](6-review-grading-and-deletion-apis.md), all of which depend on the migration, bindings, or worker scaffold landed here.

## Related

- Files: `database/migrations/20260923090000_create_assignment_reader.sql` (FILE-002); `apps/assignment-worker/**` (FILE-009); `scripts/bootstrap.sh`, `.github/workflows/deploy.yml` (FILE-016).
- Tests: TEST-002 (migration verification).
- See also: DEP-002, DEP-003, DEP-008, RISK-008.
