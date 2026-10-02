---
ticket: 5
phase: "Implementation Phase 5"
goal: GOAL-005
status: Completed
date_created: 2026-10-01
---

# Ticket 5: Implement transcription, retry, and progress services

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Part of [Assignment Reader MVP plan](../feature-assignment-reader-1.md). Builds on [Ticket 1](1-freeze-contracts-and-launch-gates.md), [Ticket 2](2-persistence-and-infrastructure-foundations.md), and [Ticket 4](4-upload-and-authenticated-image-delivery.md).

**GOAL-005**: Produce validated per-page drafts and question segments through an idempotent, observable vision pipeline with safe recovery.

## Tasks

- [x] **TASK-013**: Implement the OpenRouter vision repository and transcription prompt.
  - Add `apps/assignment-worker/src/transcription/openrouter.repository.ts`, `prompt.ts`, and `output-validator.ts`.
  - Read the canonical R2 JPEG, transform it to a maximum 2048-pixel dimension JPEG through the Images binding, base64 encode only that bounded variant, and send text first followed by the `data:image/jpeg;base64,...` image part.
  - Use `response_format: { type: 'json_schema' }` and provider `require_parameters: true` when the selected endpoint advertises structured-output support. Otherwise use the documented JSON/Response Healing path, then apply the same local validator. In both paths, use the configured primary/fallback model sequence, an AbortController timeout, and a system instruction that image text is untrusted source material rather than executable instruction.
  - Validate schema version, allowed nodes/marks/attributes, size/node/LaTeX bounds, `imageRegion` bounds/page identity, and question-segment fields. Validation failures may be summarized into the next attempt but the raw student response must not be logged.
  - Dependencies: TASK-001 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)), TASK-006 ([Ticket 2](2-persistence-and-infrastructure-foundations.md)), and TASK-012 ([Ticket 4](4-upload-and-authenticated-image-delivery.md)).
  - Acceptance: a real supported page returns valid schema-versioned draft JSON and stable question IDs; invalid/extra nodes and model-supplied grades are rejected.

- [x] **TASK-014**: Implement the per-page queue consumer and transactional state/audit updates.
  - Add `transcription.service.ts` and `db/transcription.repository.ts`; claim only the message's current `transcription_revision`, move `queued → transcribing`, and no-op/ack completed or stale duplicates.
  - Persist draft, new current question segments, page timing, attempt audit, provider-reported usage/cost when present, and the normalized per-page cost estimate/source in one transaction; set page `completed` only after validation. When the last current page completes, set document review state to `needs_review`.
  - Classify terminal errors per REQ-014. Retry transient provider/timeouts with delayed `message.retry()`; acknowledge terminal invalid-image/output exhaustion after recording `failed`; DLQ handling must preserve an actionable failed state and attempt history.
  - Write Analytics Engine dimensions/measures without content or direct identity.
  - Dependencies: TASK-013 (this ticket) and TASK-011 ([Ticket 4](4-upload-and-authenticated-image-delivery.md)).
  - Acceptance: duplicate delivery is idempotent, stale revision cannot write, successful siblings are never reprocessed due to another page's failure, mixed page states return the REQ-010 rollup, and every accepted or failed attempt has a queryable cost estimate and source.

- [x] **TASK-015**: Add progress, page retry, and whole-document retranscription APIs.
  - Add processing GET responses with per-page state, safe failure code/message, attempt count, elapsed-from-queued timestamp, rollup counts, and completed-page workspace links.
  - `POST /api/v1/pages/:pageId/retry` accepts failed pages only and increments that page's revision without changing siblings.
  - `POST /api/v1/documents/:documentType/:documentId/retranscribe` requires confirmation and rejects without `overwriteTeacherEdits: true` and `resetQuestionJudgments: true` when applicable. On consent, supersede old segments/reviews, retain audit history, create a new revision, and queue every current page.
  - Dependencies: TASK-014 (this ticket) and TASK-002 ([Ticket 1](1-freeze-contracts-and-launch-gates.md)).
  - Acceptance: retry charges/requeues one page only; full retry rejects missing consent; a stale worker cannot overwrite a teacher edit or judgment; distinct failures expose the correct retry versus replace guidance.

## Phase Completion Criteria

A real staging image completes from queue to editable draft; all failure classes, retries, DLQ behavior, state rollups, and audit rows are observable and correct.

## Dependencies

- Requires [Ticket 1](1-freeze-contracts-and-launch-gates.md) (TASK-001, TASK-002), [Ticket 2](2-persistence-and-infrastructure-foundations.md) (TASK-006), and [Ticket 4](4-upload-and-authenticated-image-delivery.md) (TASK-011, TASK-012) complete.
- Unblocks [Ticket 6](6-review-grading-and-deletion-apis.md) (TASK-016 needs TASK-014), [Ticket 8](8-processing-and-unified-workspace-surfaces.md) (TASK-023 needs TASK-015), and feeds [Ticket 9](9-instrument-disclose-verify-and-release.md) (TASK-028 needs deployed provider routing from TASK-013).

## Related

- Files: `apps/assignment-worker/src/transcription/**`, `apps/assignment-worker/src/db/**` (FILE-009); `apps/seating-backend/src/assignment-reader/**` progress/retry routes (FILE-004).
- Tests: TEST-005 (model-output validation, retry/exhaustion, idempotent duplicate handling, content-free logging).
- See also: REQ-012 through REQ-014, REQ-024, REQ-025, SEC-002, SEC-004, RISK-001, RISK-002, RISK-003, DEP-004, ALT-006.
