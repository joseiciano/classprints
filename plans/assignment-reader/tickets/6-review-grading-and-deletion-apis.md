---
ticket: 6
phase: "Implementation Phase 6"
goal: GOAL-006
status: Not Started
date_created: 2026-10-01
---

# Ticket 6: Implement review, grading, and deletion APIs

![Status: Not Started](https://img.shields.io/badge/status-Not%20Started-lightgrey)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on [Ticket 2](2-persistence-and-infrastructure-foundations.md), [Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md), [Ticket 4](4-upload-and-authenticated-image-delivery.md), and [Ticket 5](5-transcription-retry-and-progress-services.md).

**GOAL-006**: Make teacher edits, revision-aware verification, manual grading, materials history, and cross-store deletion authoritative at the server boundary.

## Tasks

- [ ] **TASK-016**: Implement draft editing and revision-aware page review.
  - Add `PATCH /api/v1/pages/:pageId/draft` with validated JSON and required `expectedContentRevision`; update with compare-and-swap and return `409` on stale revision.
  - Increment `content_revision` and `teacher_edit_count`, set `edited_by_teacher`, supersede the current page-review record, and atomically apply REQ-016 state invalidation.
  - Add `POST /api/v1/pages/:pageId/review` to persist the current content revision and `POST /api/v1/documents/:documentType/:documentId/mark-ready` gated on every current page being completed and reviewed at its current revision.
  - Add explicit `return-to-needs-review`; historical material versions and archived classes remain read-only.
  - Dependencies: TASK-007 ([Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md)) and TASK-014 ([Ticket 5](5-transcription-retry-and-progress-services.md)).
  - Acceptance: autosave survives reload, conflicting edits do not overwrite, stale review evidence cannot unlock readiness, and API calls cannot bypass the full-document gate.

- [ ] **TASK-017**: Implement materials context, question judgments, and submission grading.
  - Add idempotent PAT-002 review-context capture; material version history/current endpoints; and current/historical workspace responses.
  - Add question judgment mutations keyed by current stable segment ID and expected transcription revision; accept only teacher-authored judgment/points/comment fields.
  - Add submission grading draft mutation and `mark-graded`; validate score rules and require `ready_to_grade`. `return-to-needs-review` clears graded state/timestamp but retains draft grading fields for later revision.
  - Add an explicit `apply-question-points-to-score` command that calculates the current awarded-point sum, presents it to the teacher, and applies it only on the teacher's confirmed request.
  - Dependencies: TASK-016 (this ticket).
  - Acceptance: materials have no grading endpoints, no model field can set a grade, uncertain pages work with zero question rows, score limits hold in DB and service, and reopening removes graded visibility without deleting draft judgments.

- [ ] **TASK-018**: Integrate idempotent relational/R2 deletion and account deletion.
  - Add destructive API commands for page, materials document, submission, student data, assignment, and class. Each command creates one operation plus one object row per current/historical key, marks the scope deletion-pending, and enqueues only the operation ID for the [Ticket 2](2-persistence-and-infrastructure-foundations.md) TASK-006 cleanup consumer.
  - Ensure each scope enumerates all descendant rows and current/historical R2 keys before it becomes unavailable; relational finalization occurs only after the cleanup consumer marks every object complete.
  - Extend `apps/seating-backend/src/user/user.routes.ts` so account deletion soft-disables access immediately, cancels billing as today, schedules all Assignment Reader keys/data, and returns an accepted/pending response. Update `apps/seating-frontend/src/hooks/use-delete-account.ts` for that response without restoring access.
  - Expose operator-safe status/error fields for DLQ recovery; never include image content or full keys in logs.
  - Dependencies: TASK-006 ([Ticket 2](2-persistence-and-infrastructure-foundations.md)), TASK-007 ([Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md)), and TASK-010 ([Ticket 4](4-upload-and-authenticated-image-delivery.md)).
  - Acceptance: page, document, student-data, assignment, class, and account deletion each remove rows and every R2 object; running the same operation twice succeeds; injected mid-batch failure resumes without orphaning or exposing the target.

## Phase Completion Criteria

All review/grading invariants are server-enforced; historical context remains stable; every deletion scope is replay-safe across Postgres and R2.

## Dependencies

- Requires [Ticket 2](2-persistence-and-infrastructure-foundations.md) (TASK-006), [Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md) (TASK-007), [Ticket 4](4-upload-and-authenticated-image-delivery.md) (TASK-010), and [Ticket 5](5-transcription-retry-and-progress-services.md) (TASK-014) complete.
- Unblocks [Ticket 7](7-hierarchy-and-upload-frontend-surfaces.md) (TASK-020/TASK-021 need TASK-018, TASK-017), [Ticket 8](8-processing-and-unified-workspace-surfaces.md) (TASK-024 needs TASK-016; TASK-025/TASK-026 need TASK-017).

## Related

- Files: `apps/seating-backend/src/assignment-reader/**` (FILE-004); `apps/seating-backend/src/user/user.routes.ts` (FILE-007); `apps/seating-frontend/src/hooks/use-delete-account.ts` (FILE-014).
- Tests: TEST-003 (revision compare-and-swap, readiness/grading gates, retained draft grading data), TEST-006 (deletion replay/failure injection).
- See also: REQ-016 through REQ-019, REQ-022, SEC-001, RISK-004.
