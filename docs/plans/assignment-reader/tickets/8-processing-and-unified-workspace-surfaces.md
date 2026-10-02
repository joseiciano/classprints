---
ticket: 8
phase: "Implementation Phase 8"
goal: GOAL-008
status: Completed
date_created: 2026-10-01
---

# Ticket 8: Build processing and unified workspace surfaces

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on [Ticket 1](1-freeze-contracts-and-launch-gates.md), [Ticket 5](5-transcription-retry-and-progress-services.md), [Ticket 6](6-review-grading-and-deletion-apis.md), and [Ticket 7](7-hierarchy-and-upload-frontend-surfaces.md).

**GOAL-008**: Deliver the source-first processing, recovery, review, and manual grading experience represented by the reconciled wireframes while preserving the shared state invariants.

## Tasks

- [x] **TASK-023**: Build processing status and recovery UI.
  - Add smart/view pairs for the canonical Processing table and per-document page detail. Poll with TanStack Query every 3000 ms only while visible and any page is non-terminal; compute elapsed display from queued timestamps without writing timer state to the server.
  - Show completed-page **Review now** actions without a document review chip until all pages complete. Render safe failure taxonomy, page retry, page replacement, and whole-document retranscription confirmation with separate teacher-edit and question-judgment reset consent.
  - Dependencies: TASK-015 ([Ticket 5](5-transcription-retry-and-progress-services.md)) and TASK-019 ([Ticket 7](7-hierarchy-and-upload-frontend-surfaces.md)).
  - Acceptance: mixed states and counts match API rollup; hidden/unmounted/completed views stop polling; page retry never presents successful pages as requeued; consent copy names re-billing and overwritten teacher work.

- [x] **TASK-024**: Add the Tiptap editor and stable Assignment Reader document extensions.
  - Add exact dependencies `@tiptap/react@3.31.3`, `@tiptap/pm@3.31.3`, `@tiptap/starter-kit@3.31.3`, `@tiptap/extension-mathematics@3.31.3`, `@tiptap/extension-underline@3.31.3`, and `katex@0.18.9` to `apps/seating-frontend/package.json`; all Tiptap packages stay on the same exact version and the lockfile is committed.
  - Create `src/components/assignment-reader/editor/assignment-editor.tsx`, `math-extension.ts`, `image-region-extension.tsx`, and `document-adapter.ts`. Limit commands/rendering to PAT-001 nodes and marks; implement `imageRegion` as a selectable block atom with no editable child content; never persist or render arbitrary HTML.
  - Debounce autosave, pass `expectedContentRevision`, surface conflict/reload resolution, and mark a page reviewed only by explicit teacher action after the latest save succeeds.
  - Dependencies: TASK-001 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)) and TASK-016 ([Ticket 6](6-review-grading-and-deletion-apis.md)).
  - Acceptance: paragraphs, lists, hard breaks, underline, inline/block math, and authenticated image regions round-trip without schema drift; KaTeX cannot trust embedded commands; invalid JSON cannot enter editor state; a 409 never silently discards local edits.

- [x] **TASK-025**: Build the unified materials/submission workspace.
  - Add smart/view pairs for document identity, original viewer, editor, page navigation, processing placeholders, review controls, materials side rail, and historical read-only mode.
  - Capture submission review context before loading its materials rail. Allow early completed-page editing, but keep document readiness unavailable until all pages complete and every current revision is reviewed.
  - Add zoom/rotation and image-region rendering through TASK-012 ([Ticket 4](4-upload-and-authenticated-image-delivery.md)) only; no public URLs or base64 image data in frontend state.
  - Dependencies: TASK-023, TASK-024 (this ticket), and TASK-017 ([Ticket 6](6-review-grading-and-deletion-apis.md)).
  - Acceptance: original and draft remain together across page navigation/reload, materials open without leaving the submission workspace, archived/history mode is read-only, and teacher edits remain authoritative.

- [x] **TASK-026**: Add manual question grading and submission grading rail.
  - Render one row per current parsed segment with explicit Correct/Incorrect/Unmarked, optional points, and optional comment; show a clear submission-level fallback when there are no segments.
  - Render score/comments and **Mark graded** only for submissions and only when ready; allow the assignment maximum to be set or changed in this rail through the same assignment mutation used by settings. Add separate **Return to Needs review**. Offer explicit **Use question-points sum** confirmation rather than automatic calculation.
  - Retain draft values after reopening but remove the submission from Graded filters/counts immediately.
  - Dependencies: TASK-025 (this ticket) and TASK-017 ([Ticket 6](6-review-grading-and-deletion-apis.md)).
  - Acceptance: materials never render grading, readiness cannot be bypassed from UI or direct API, assignment-maximum edits immediately use the same score validation and display contract, score rules produce clear errors, and question edits persist without automatic judgment.

## Phase Completion Criteria

All product launch criteria for processing, source comparison, correction, material access, review, question judgment, and grading pass through the actual UI.

## Dependencies

- Requires [Ticket 1](1-freeze-contracts-and-launch-gates.md) (TASK-001), [Ticket 5](5-transcription-retry-and-progress-services.md) (TASK-015), [Ticket 6](6-review-grading-and-deletion-apis.md) (TASK-016, TASK-017), and [Ticket 7](7-hierarchy-and-upload-frontend-surfaces.md) (TASK-019) complete.
- Unblocks [Ticket 9](9-instrument-disclose-verify-and-release.md) (TASK-027 depends on TASK-014 through TASK-026).

## Related

- Files: `apps/seating-frontend/src/router.tsx` and Assignment Reader page smart/view pairs (FILE-011); `apps/seating-frontend/src/components/assignment-reader/editor/**` (FILE-012); `apps/seating-frontend/package.json`, `apps/seating-frontend/tests/assignment-reader*.test.tsx`, `pnpm-lock.yaml` (FILE-015).
- Tests: TEST-007 (background polling stop, partial-page review without document state, editor conflict handling, materials-without-grading, readiness lock, score errors, explicit return-to-review behavior).
- See also: REQ-015 through REQ-019, PAT-001, DEP-005, RISK-006.
