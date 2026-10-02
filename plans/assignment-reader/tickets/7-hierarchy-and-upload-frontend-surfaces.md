---
ticket: 7
phase: "Implementation Phase 7"
goal: GOAL-007
status: Not Started
date_created: 2026-10-01
---

# Ticket 7: Build hierarchy and upload frontend surfaces

![Status: Not Started](https://img.shields.io/badge/status-Not%20Started-lightgrey)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on [Ticket 1](1-freeze-contracts-and-launch-gates.md), [Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md), [Ticket 4](4-upload-and-authenticated-image-delivery.md), and [Ticket 6](6-review-grading-and-deletion-apis.md).

**GOAL-007**: Deliver navigable class/assignment management and reusable canonical list/upload UI against the completed contracts.

## Tasks

- [ ] **TASK-019**: Add typed API/query/router foundations.
  - Create `apps/seating-frontend/src/lib/assignment-reader-api.ts`, `src/hooks/use-assignment-reader.ts`, and `src/lib/assignment-reader-query-keys.ts` using the shared schemas and existing `request()` wrapper.
  - Extend `apps/seating-frontend/src/router.tsx` with `/classes`, `/classes/$classId`, `/classes/$classId/assignments/$assignmentId`, upload, processing, and workspace routes. Validate canonical list search params and prefetch with query options.
  - Update the authenticated sidebar so Classes is the single Management entry and remains active across every descendant route; retain Settings and Pricing.
  - Dependencies: TASK-001 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)), TASK-007, and TASK-008 ([Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md)).
  - Acceptance: route params/search are type-safe, browser back/forward restores list state, and mutations invalidate only affected query-key branches.

- [ ] **TASK-020**: Build the canonical list and hierarchy surfaces with smart/view separation.
  - Create `apps/seating-frontend/src/components/assignment-reader/canonical-list.tsx` and `canonical-list-view.tsx` as the only sortable/searchable/paginated table implementation.
  - Add smart/view pairs under `src/pages/` and `src/components/assignment-reader/` for Classes, Class Dashboard, roster management, and assignment create/edit. Render exact columns from REQ-003, Assignments/Seating Charts tabs, rename/archive/new actions, explicit class/assignment/student-data deletion confirmations, and read-only archived mode.
  - Add accessible table headers/buttons, labeled search, keyboard row activation, focus-visible states, empty/loading/error states, and 10-row pagination. Do not reproduce mockup-only CSS.
  - Dependencies: TASK-019 (this ticket), TASK-008, TASK-009 ([Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md)), and TASK-018 ([Ticket 6](6-review-grading-and-deletion-apis.md)).
  - Acceptance: a teacher can complete class/student/assignment setup and invoke every hierarchy-level deletion allowed by REQ-022; every list shares one implementation; deletion-pending targets disappear immediately; archived routes expose no enabled mutation controls; saved charts open from the class tab.

- [ ] **TASK-021**: Build assignment detail and materials/submission management.
  - Add smart/view pairs for current materials, version history, canonical submissions, filters, not-started roster rows, create submission, replacement/retranscription, and context-versus-submission identity labels. Provide explicit confirmations for deleting a current page, the materials document, or a submission.
  - Apply PAT-003 status and score display. Historical materials open in read-only workspace; no materials row contributes to submission totals.
  - Dependencies: TASK-020 (this ticket), TASK-007 ([Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md)), TASK-017, and TASK-018 ([Ticket 6](6-review-grading-and-deletion-apis.md)).
  - Acceptance: the assignment route shows live processing/review/grading states without contradictory chips, old material versions remain accessible, a not-started student can create exactly one submission, and every document-level deletion allowed by REQ-022 becomes unavailable immediately while cleanup is pending.

- [ ] **TASK-022**: Build the shared ordered upload flow.
  - Add upload smart/view components that accept JPEG/PNG/HEIC, mirror 10 MB/20-page limits, show per-file upload/error/replace/remove state, support keyboard-accessible reordering, and upload each file through an independent one-page request with bounded concurrency 3.
  - Confirmation sends the final page-ID order, starts transcription, and navigates back to assignment detail; leaving the route must not cancel already accepted pages.
  - Treat client checks as UX only and render server validation by row. Never create a presigned URL or one 200 MB request.
  - Dependencies: TASK-011 ([Ticket 4](4-upload-and-authenticated-image-delivery.md)) and TASK-019 (this ticket).
  - Acceptance: both material and submission modes use the same component, page order survives, oversized/spoofed files show actionable replacement errors, and confirmation returns to an independently updating assignment page.

## Phase Completion Criteria

Teachers can establish hierarchy, inspect all canonical lists, save seating charts, create/replace materials, create submissions, order pages, start background transcription, and invoke every teacher-facing deletion scope from production UI.

## Dependencies

- Requires [Ticket 1](1-freeze-contracts-and-launch-gates.md) (TASK-001), [Ticket 3](3-hierarchy-lists-and-saved-seating-charts.md) (TASK-007, TASK-008, TASK-009), [Ticket 4](4-upload-and-authenticated-image-delivery.md) (TASK-011), and [Ticket 6](6-review-grading-and-deletion-apis.md) (TASK-017, TASK-018) complete.
- Unblocks [Ticket 8](8-processing-and-unified-workspace-surfaces.md) (TASK-023 needs TASK-019).

## Related

- Files: `apps/seating-frontend/src/lib/assignment-reader-api.ts`, `assignment-reader-query-keys.ts`, `src/hooks/use-assignment-reader.ts` (FILE-010); `apps/seating-frontend/src/router.tsx` and Assignment Reader page smart/view pairs (FILE-011); `apps/seating-frontend/src/pages/job-detail.tsx` (FILE-013).
- Tests: TEST-007 (canonical URL-backed sort/search/page, upload one-file requests/order confirmation, destructive-action confirmation, immediate removal of deletion-pending targets).
- See also: REQ-003, REQ-022, GUD-002, GUD-003, PAT-003.
