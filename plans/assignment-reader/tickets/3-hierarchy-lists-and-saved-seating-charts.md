---
ticket: 3
phase: "Implementation Phase 3"
goal: GOAL-003
status: Completed
date_created: 2026-10-01
---

# Ticket 3: Implement hierarchy, lists, and saved seating charts

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on [Ticket 1](1-freeze-contracts-and-launch-gates.md) and [Ticket 2](2-persistence-and-infrastructure-foundations.md).

**GOAL-003**: Deliver authenticated class/roster/assignment/submission/material metadata services and every canonical list contract before file processing is integrated.

## Tasks

- [x] **TASK-007**: Add the Assignment Reader backend module using controller → service → repository boundaries.
  - Create `apps/seating-backend/src/assignment-reader/assignment-reader.routes.ts`, `assignment-reader.service.ts`, `assignment-reader.repository.ts`, `assignment-reader.types.ts`, and `index.ts`; register the protected subapp from `apps/seating-backend/src/index.ts` under `/api/v1`.
  - Implement shared repository ownership joins and service guards for teacher ownership, archived ancestry, historical material versions, and deletion-pending records. Controllers must only parse Zod input, call services, and map domain errors to HTTP responses.
  - Expose CRUD routes for `/classes`, `/classes/:classId/students`, `/classes/:classId/assignments`, `/assignments/:assignmentId/material-versions`, and `/assignments/:assignmentId/submissions`; use PATCH for rename/max-score/archive metadata and explicit command endpoints for state transitions.
  - Dependencies: TASK-001, TASK-002 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)), and TASK-004 ([Ticket 2](2-persistence-and-infrastructure-foundations.md)).
  - Acceptance: all route families require an authenticated session; cross-teacher IDs return `404 RESOURCE_NOT_FOUND` exactly as specified by `plan/assignment-reader/api-manifest.md` §1.1, never a `403` that would confirm resource existence; archived ancestry rejects mutation at service and repository write boundaries.

- [x] **TASK-008**: Implement all canonical server-side list queries.
  - Add list methods for Classes, Assignments, Seating Charts, Submissions, and Processing with allow-listed sort columns, case-insensitive search over exactly the displayed columns, stable ID tiebreak sorting, fixed `pageSize = 10`, total count, and page count.
  - Submissions must left-join the class roster so active students without submissions appear as `Not started`; only created submissions participate in PAT-003 assignment status.
  - Return processing state counts separately from review/grading state; never label a partial document `Needs review`.
  - Dependencies: TASK-007 (this ticket).
  - Acceptance: each declared column sorts in both directions, search covers all displayed columns, `pageSize` is not part of the canonical query contract (the parameter is rejected as an unknown field), and two teachers cannot influence each other's counts.

- [x] **TASK-009**: Add minimal class-scoped Seating Charts persistence and save flow.
  - Extend `apps/seating-backend/src/seating/seating.routes.ts`, `seating.service.ts`, and `seating.db.ts` with `POST /api/v1/seating/:externalId/save-to-class`.
  - Verify the authenticated teacher owns both source job and target class; reject archived classes; copy the selected grid/result into `saved_seating_charts` rather than referencing mutable result data only.
  - Add the class list query through the Assignment Reader repository; update `apps/seating-frontend/src/pages/job-detail.tsx` with a class selector and **Save to class** mutation.
  - Dependencies: TASK-004 ([Ticket 2](2-persistence-and-infrastructure-foundations.md)) and TASK-007 (this ticket).
  - Acceptance: saving is idempotent for `(class_id, source_job_id)`, saved snapshots remain viewable if the source job changes, and another teacher's class/job cannot be selected.

## Phase Completion Criteria

Launch hierarchy criterion works through APIs; all five canonical lists satisfy the shared contract; archives are read-only; class-scoped chart snapshots can be created and listed.

## Dependencies

- Requires [Ticket 1](1-freeze-contracts-and-launch-gates.md) (TASK-001, TASK-002) and [Ticket 2](2-persistence-and-infrastructure-foundations.md) (TASK-004) complete.
- Unblocks [Ticket 4](4-upload-and-authenticated-image-delivery.md), [Ticket 6](6-review-grading-and-deletion-apis.md) (TASK-018 needs TASK-007), and [Ticket 7](7-hierarchy-and-upload-frontend-surfaces.md) (needs TASK-007/TASK-008/TASK-009).

## Related

- Files: `apps/seating-backend/src/assignment-reader/**` (FILE-004); `apps/seating-backend/src/index.ts` (FILE-005); `apps/seating-backend/src/seating/seating.routes.ts`, `seating.service.ts`, `seating.db.ts` (FILE-006); `apps/seating-backend/tests/assignment-reader*.test.ts` (FILE-008).
- Tests: TEST-003 (ownership isolation, archived-subtree denial, one-submission-per-student, assignment aggregate denominator), TEST-008 (cross-tenant list denial).
- See also: REQ-001 through REQ-006, REQ-021, PAT-003, DEP-007.
