---
goal: Deliver the Assignment Reader MVP end to end

date_created: 2026-09-23
last_updated: 2026-10-01
status: 'In Progress'
tags: [feature, assignment-reader, cloudflare-workers, postgres, react, ai]
---

# Introduction

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

This plan delivers the complete teacher-only Assignment Reader MVP defined by
[`plan/assignment-reader/product-doc.md`](assignment-reader/product-doc.md), using the infrastructure decisions in
[`plan/assignment-reader/functional-spec.md`](assignment-reader/functional-spec.md), the normative HTTP contract in
[`plan/assignment-reader/api-manifest.md`](assignment-reader/api-manifest.md), and the annotated behavioral wireframes in
[`plan/assignment-reader/mockups/`](assignment-reader/mockups/). Completion of every phase is completion of the MVP; deferred items are explicitly excluded rather than left as follow-up implementation gaps.

The PRD is authoritative across all artifacts. A partially processed document has no review state even though completed pages are editable; a graded submission returns explicitly to **Needs review**, not to **Ready to grade**; and Submissions and Processing use the canonical table contract. The functional specification, executable plan, and annotated wireframes encode these rules consistently.

The plan closes the functional specification's editor blocker: drafts are stored as schema-versioned ProseMirror-compatible JSONB and edited with Tiptap. The persisted shape is `{ "schemaVersion": 1, "doc": { "type": "doc", "content": [...] } }`. Allowed nodes are `doc`, `paragraph`, `heading` (levels 1–3), `bulletList`, `orderedList`, `listItem`, `hardBreak`, `text`, `inlineMath`, `blockMath`, and the custom block atom `imageRegion`; allowed text marks are `bold`, `italic`, and `underline`. An `imageRegion` stores `regionId`, normalized `x`, `y`, `width`, and `height` values in `[0,1]`, `reason` (`diagram|drawing|illegible|other`), and an optional teacher-visible label. It derives its authenticated crop URL from the current page ID and never stores a URL or base64 data. Raw/generated HTML is never the persistence format.

## 1. Requirements & Constraints

- **REQ-001**: Every class and every descendant roster record, assignment, document, page, transcription, question judgment, grade, seating-chart snapshot, and blob must be owned by the authenticated teacher. Students are roster records and never authentication identities.
- **REQ-002**: Teachers must be able to create, rename, view, and archive classes; add, rename, and remove roster students; create assignments; and set an optional maximum score. Removing a student from a roster must preserve historical submissions; explicit student-data deletion is a separate destructive operation.
- **REQ-003**: Classes, Assignments, Seating Charts, Submissions, and Processing must use one canonical server-driven list contract: sortable declared columns, search across every displayed column, a maximum of 10 rows per page, row-open navigation, and URL-backed `q`, `sort`, `direction`, and `page` parameters. Column sets are Classes (`Date · Class · Students · Assignments · Status`), Assignments (`Date · Assignment · Status`), Seating Charts (`Date · Class · Student Count`), Submissions (`Date · Name · Status`), and Processing (`Date · Name · Status`).
- **REQ-004**: Each assignment may have zero or one current ordered assignment-materials document. Materials are teacher context, are never graded, and are excluded from submission and grading counts.
- **REQ-005**: Replacing assignment materials must create a new version with new page records and blobs. Historical versions remain readable but immutable. A submission records the current materials version on first workspace entry; that `materials_version_id` then remains immutable so later replacements cannot change the context used during review.
- **REQ-006**: One submission per student per assignment is allowed. A submission may be created without assignment materials. The unique `(assignment_id, student_id)` constraint must return the existing submission rather than create a duplicate.
- **REQ-007**: Both document types accept JPEG, PNG, and HEIC only, with no more than 20 pages and 10 MB per source image. Server-side byte inspection is authoritative; extension and browser MIME are advisory. PDF must be rejected. Every accepted source is normalized to one canonical JPEG before R2 persistence.
- **REQ-008**: Uploads must proxy through the authenticated API Worker without presigned URLs. The browser uploads one page per multipart request, then confirms an ordered list of immutable page IDs in a separate request; it must never send the maximum 20 × 10 MB set as one Worker request.
- **REQ-009**: Transcription must run asynchronously as one queue message per page. Page states are `uploading`, `queued`, `transcribing`, `completed`, and `failed`. Pages complete independently and remain ordered by `position`.
- **REQ-010**: Document processing rollup precedence is deterministic: `failed` if any page failed; otherwise `uploading` if any page is uploading; otherwise `transcribing` if any page is transcribing; otherwise `queued` if any page is queued; otherwise `completed` only when every page completed. Counts by page state must also be returned so mixed states remain visible.
- **REQ-011**: A completed page is immediately reviewable and editable while sibling pages continue processing. A document's review state remains unavailable until every current page is completed; only then does it enter `needs_review`.
- **REQ-012**: Model output must validate against the versioned draft schema and a question-segment schema before persistence. It must preserve meaningful text, lists, line breaks, and math best-effort, use `imageRegion` nodes for diagrams/drawings/illegible content, and never invent content or a question row when uncertain.
- **REQ-013**: Default retry must requeue only the failed page. Whole-document retranscription is a separate confirmed action. If any page has teacher edits or question judgments, the API and worker must reject the action unless explicit overwrite/reset consent is recorded for that transcription revision.
- **REQ-014**: Failure codes must distinguish `provider_timeout`, `provider_rejected`, `invalid_output`, `storage_failure`, and `invalid_image`; teacher-facing responses must expose safe recovery guidance without provider payloads or student content in logs.
- **REQ-015**: The workspace must identify materials versus submission, display each authenticated original beside its editable draft, support page navigation, zoom, rotation, authenticated image-region display, autosave, and assignment-material access during submission review. Materials workspaces must omit all grading controls.
- **REQ-016**: Readiness must be revision-aware. Each current page revision needs an explicit teacher review record. Editing a reviewed page increments `content_revision` and invalidates that page's review record. If the document already has a review state, the edit atomically returns it to `needs_review`; a partially processed document continues to have no review state. For submissions, invalidation also changes grading state to `not_graded` while retaining draft score, comments, and question judgments.
- **REQ-017**: Documents move from `needs_review` to `ready_to_grade` only after all current page revisions are reviewed. Materials stop there as verified context. Submissions can be marked `graded` only from `ready_to_grade`, and an explicit **Return to Needs review** action must clear graded state and timestamp.
- **REQ-018**: Submission score and comments are optional. Scores accept at most two decimal places, must be non-negative, and must not exceed the assignment maximum when one exists. Display must be `8.5 / 10` with a maximum or `8.5` without one; no percentage conversion is allowed. The assignment maximum may be edited from assignment settings or the submission grading rail through the same assignment mutation and validation contract.
- **REQ-019**: Parsed question segments have stable IDs within a transcription revision. Teacher judgments are stored separately as `unmarked`, `correct`, or `incorrect`, with optional awarded points and comment. No per-question maximum or denominator is shown. Model output must never set judgment, points, comments, or submission score.
- **REQ-020**: Original JPEGs must remain private in one R2 bucket per environment. Object keys must be `teacher/{teacherId}/class/{classId}/assignment/{assignmentId}/{documentType}/{pageId}.jpg`; sequence position must never be part of identity. All originals, thumbnails, rotations, transcription variants, and crops are served only after ownership authorization.
- **REQ-021**: Archived classes and their descendants remain readable but reject every mutation, upload, retry, grading action, or seating-chart save. Unarchive is not part of this release.
- **REQ-022**: Teachers may delete a page, materials document, submission, student's data, assignment, class, or account data. Cross-store deletion must use durable operation/object rows plus a queue; it must remove both relational records and R2 keys, be safe to replay, and make the target unavailable immediately while cleanup is pending.
- **REQ-023**: The class dashboard must expose Assignments and Seating Charts tabs. Existing seating results gain an authenticated **Save to class** action that persists an immutable class-scoped grid snapshot, student count, source job, and creation time.
- **REQ-024**: The model is configured per environment through required `TRANSCRIPTION_MODEL` and `TRANSCRIPTION_FALLBACK_MODELS` variables and the existing `LLM_API_KEY` secret. Only image-capable OpenRouter endpoints may be deployed. Use native structured outputs when the selected endpoint supports them; otherwise use the validated JSON fallback described by the functional specification. Model/provider selection must never appear in teacher UI.
- **REQ-025**: Per-page attempt audit must persist document type, model, attempt, queue timestamp, start/end timestamps, latency, outcome, failure code, provider-reported usage/cost when present, a normalized cost estimate with its calculation source, and whether the job was a retry. Backend and frontend events must make upload-to-draft latency, failure/retry rate, ready/graded conversion, pages-ever-edited, review duration, materials adoption/open rate, and per-page cost computable by document type/model.
- **REQ-026**: Before production launch, privacy and terms must disclose that student work and assignment materials, including answer keys and rubrics, are sent through OpenRouter to the selected provider; state verified processing, retention, deletion, and account-deletion behavior; document whether zero-retention routing is available and selected; and avoid unsupported school-policy or legal-compliance claims.
- **SEC-001**: Every list, record, image, mutation, queue job, and deletion operation must resolve teacher ownership server-side; opaque IDs alone never authorize access.
- **SEC-002**: Model output, multipart metadata, query sort fields, editor JSON, and crop coordinates are untrusted inputs and must be allow-list validated. The prompt must state that text inside an image is data to transcribe, not instructions to execute.
- **SEC-003**: Student content, original images, model prompts/responses, and signed-in user identifiers must not be written to application logs or Analytics Engine dimensions. Operational logs use IDs, state, error code, model, latency, and cost only.
- **SEC-004**: Queue work must be idempotent. Every transcription message carries `pageId` and `transcriptionRevision`; persistence uses a conditional update so stale/duplicate jobs cannot overwrite a newer upload, retry, teacher edit, or consent decision.
- **CON-001**: Reuse the current pnpm/TypeScript stack, Hono API in `apps/seating-backend`, React 19/Vite/TanStack Router/TanStack Query frontend in `apps/seating-frontend`, Neon Postgres through Hyperdrive, Cloudflare Queues, R2, Images, Analytics Engine, and the staging-default Wrangler deployment pattern.
- **CON-002**: Progress uses TanStack Query polling every 3 seconds while the processing route is mounted and `document.visibilityState === 'visible'`; polling stops when complete, hidden, or unmounted. No Durable Object, WebSocket, SSE, or other realtime subsystem is permitted for this MVP.
- **CON-003**: AI grading, grading recommendations, automatic feedback, rubric grading, answer matching, confidence highlighting, PDF, student accounts/uploads, guardian/admin accounts, sharing/export, LMS/SIS integration, materials libraries, quotas, usage packaging, and teacher-facing model controls are out of scope.
- **CON-004**: The annotated mockups define behavior and information hierarchy, not production CSS. Production UI must use the existing app design system and accessibility conventions rather than copy `mockups/assets/mockup.css`.
- **GUD-001**: Backend code follows the existing Hono controller → service → repository flow. Route modules parse HTTP and map responses only; services own authorization, state transitions, and orchestration; repositories own Postgres, R2, Images, and OpenRouter access.
- **GUD-002**: Data-backed frontend pages use smart/view separation: smart components own router/query/mutation/state orchestration and pure view components receive render-ready props and callbacks.
- **GUD-003**: TanStack Query keys are hierarchical tuple factories and include every filter; mutations invalidate only affected class/assignment/document keys. Router search parameters are validated and are the source of truth for canonical list state.
- **PAT-001**: Draft JSONB uses the exact wrapper and node/mark allow-list declared in the introduction. Reject unknown nodes, marks, and attributes; payloads over 1 MiB; documents over 5,000 nodes; and LaTeX strings over 4,096 characters. Tiptap renders/edits the document; KaTeX renders `inlineMath` and `blockMath` with `trust: false` and `throwOnError: false`; a selectable, childless React NodeView renders `imageRegion` through the authenticated image API. Generated KaTeX HTML is never persisted.
- **PAT-002**: A submission's material context is captured idempotently by `POST /api/v1/submissions/:submissionId/review-context` on first workspace entry and is immutable after assignment. If no current materials version exists, the stored value remains `null`.
- **PAT-003**: Assignment aggregate status excludes materials and roster students without a created submission. It is `Graded` only when at least one submission exists and every created submission is graded; every other case is `Need review`.
- **PAT-004**: Retranscription never remaps question judgments by position. New segment IDs are created for the new transcription revision; superseded segments and their judgments remain audit history and are omitted from the current workspace.

## 2. Implementation Steps

### Implementation Phase 1: Freeze contracts and launch gates

- **GOAL-001**: Establish one deterministic data/API/editor/privacy contract so schema, API, worker, and frontend tracks can proceed without later interpretation.

- [x] **TASK-001**: Create `packages/assignment-reader-shared` and encode the cross-runtime contract.
  - Add `package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/schemas.ts`, `src/content-schema.ts`, and `src/queue-messages.ts`; export every enum, list request/response schema, command payload, draft node, question segment, error code, and discriminated queue message declared by `plan/assignment-reader/api-manifest.md`.
  - Add the package to `apps/seating-backend/package.json`, `apps/seating-frontend/package.json`, and the new worker package in TASK-006; update `pnpm-lock.yaml` once.
  - Use Zod schemas at every API/provider boundary and plain TypeScript types internally; do not put React, Hono, Postgres, or Worker binding types in the package.
  - Acceptance: backend, frontend, and worker import the same processing/review/grading enums and `schemaVersion: 1` validator; malformed nodes, unsafe crop coordinates, automatic judgments, and unknown fields are rejected.

- [x] **TASK-002**: Record and enforce the resolved state and lifecycle rules in service-level transition functions.
  - Add pure functions to the shared package for document processing rollup, allowed review/grading transitions, score validation, assignment aggregate status, and retranscription consent requirements.
  - Encode the exact decisions in REQ-010, REQ-016 through REQ-019, PAT-002, PAT-003, and PAT-004; do not derive these rules independently in UI and API.
  - Acceptance: table-driven contract tests cover every allowed/forbidden transition, mixed page-state precedence, zero-submission assignment status, decimal scores, and edit-triggered review invalidation.

- [ ] **TASK-003**: Start the external provider/privacy launch track and define its evidence artifact.
  - Verify the selected OpenRouter routing configuration and downstream provider policies for image input, structured outputs, data collection, retention, deletion, and zero-retention handling.
  - Store no credentials or copied legal prose in the repository. Record verified links, effective dates, selected routing controls, and approved disclosure language directly in `apps/seating-frontend/src/pages/privacy-policy.tsx` and `apps/seating-frontend/src/pages/terms-of-service.tsx` during TASK-028.
  - Acceptance: an accountable product/legal owner has approved the exact disclosure checklist in REQ-026; production release remains blocked until TASK-028 is complete.

- Phase completion criteria: the shared package compiles; transition contract tests pass; no blocking artifact ambiguity remains; provider/privacy work is active with explicit launch ownership.

### Implementation Phase 2: Build persistence and infrastructure foundations

- **GOAL-002**: Provide durable relational, object-storage, queue, binding, and deployment foundations for every Assignment Reader lifecycle.

- [x] **TASK-004**: Add `database/migrations/20260923090000_create_assignment_reader.sql` with complete constraints and indexes.
  - Create `classes`, `students`, `assignments`, `assignment_material_versions`, `submissions`, `pages`, `page_reviews`, `question_segments`, `question_judgments`, `transcription_attempts`, `saved_seating_charts`, `deletion_operations`, and `deletion_objects`.
  - Use UUID primary keys, existing `public.users(id)` ownership, bigint millisecond timestamps to match the repository, `numeric(...,2)` for score/points, `numeric(18,8)` for per-attempt cost, JSONB for versioned editor nodes, per-page/per-revision question-segment arrays, and grid snapshots, plus check constraints for enums, score precision/range, normalized crop data, page parent exclusivity, and page position.
  - Enforce unique `(assignment_id, student_id)`, unique material `(assignment_id, version)`, one current material version per assignment with a partial unique index, unique page position within its parent, one question-segment payload per page/revision, one teacher judgment per segment ID within that page/revision, and unique saved chart source per class/job.
  - Index every foreign key and primary list predicate: teacher/status/date for classes; class/status/date for students and assignments; assignment/status/date for submissions/materials; parent/position and processing state for pages; operation/status for deletion rows; page/revision for attempts/segment payloads/judgments/reviews.
  - Do not rely on relational cascades alone for records containing R2 keys: destructive services first create deletion rows and mark the scope pending, then TASK-018 finalizes relational deletion after R2 success.
  - Dependencies: TASK-001 and TASK-002.
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
  - Dependencies: TASK-001, TASK-004, and TASK-005.
  - Acceptance: package-scoped typecheck/test/dry-run commands pass in both Wrangler environments; a synthetic transcription message reaches the worker without mutating a document; and a seeded cleanup operation completes, then replays as a no-op after an injected partial failure.

- Phase completion criteria: migration, R2, Images, queues, generated bindings, worker deploy, and CI ordering are proven in staging and dry-run cleanly for production.

### Implementation Phase 3: Implement hierarchy, lists, and saved seating charts

- **GOAL-003**: Deliver authenticated class/roster/assignment/submission/material metadata services and every canonical list contract before file processing is integrated.

- [ ] **TASK-007**: Add the Assignment Reader backend module using controller → service → repository boundaries.
  - Create `apps/seating-backend/src/assignment-reader/assignment-reader.routes.ts`, `assignment-reader.service.ts`, `assignment-reader.repository.ts`, `assignment-reader.types.ts`, and `index.ts`; register the protected subapp from `apps/seating-backend/src/index.ts` under `/api/v1`.
  - Implement shared repository ownership joins and service guards for teacher ownership, archived ancestry, historical material versions, and deletion-pending records. Controllers must only parse Zod input, call services, and map domain errors to HTTP responses.
  - Expose CRUD routes for `/classes`, `/classes/:classId/students`, `/classes/:classId/assignments`, `/assignments/:assignmentId/material-versions`, and `/assignments/:assignmentId/submissions`; use PATCH for rename/max-score/archive metadata and explicit command endpoints for state transitions.
  - Dependencies: TASK-001, TASK-002, and TASK-004.
  - Acceptance: all route families require an authenticated session; cross-teacher IDs return `404 RESOURCE_NOT_FOUND` exactly as specified by `plan/assignment-reader/api-manifest.md` §1.1, never a `403` that would confirm resource existence; archived ancestry rejects mutation at service and repository write boundaries.

- [ ] **TASK-008**: Implement all canonical server-side list queries.
  - Add list methods for Classes, Assignments, Seating Charts, Submissions, and Processing with allow-listed sort columns, case-insensitive search over exactly the displayed columns, stable ID tiebreak sorting, fixed `pageSize = 10`, total count, and page count.
  - Submissions must left-join the class roster so active students without submissions appear as `Not started`; only created submissions participate in PAT-003 assignment status.
  - Return processing state counts separately from review/grading state; never label a partial document `Needs review`.
  - Dependencies: TASK-007.
  - Acceptance: each declared column sorts in both directions, search covers all displayed columns, `pageSize` is not part of the canonical query contract (the parameter is rejected as an unknown field), and two teachers cannot influence each other's counts.

- [ ] **TASK-009**: Add minimal class-scoped Seating Charts persistence and save flow.
  - Extend `apps/seating-backend/src/seating/seating.routes.ts`, `seating.service.ts`, and `seating.db.ts` with `POST /api/v1/seating/:externalId/save-to-class`.
  - Verify the authenticated teacher owns both source job and target class; reject archived classes; copy the selected grid/result into `saved_seating_charts` rather than referencing mutable result data only.
  - Add the class list query through the Assignment Reader repository; update `apps/seating-frontend/src/pages/job-detail.tsx` with a class selector and **Save to class** mutation.
  - Dependencies: TASK-004 and TASK-007.
  - Acceptance: saving is idempotent for `(class_id, source_job_id)`, saved snapshots remain viewable if the source job changes, and another teacher's class/job cannot be selected.

- Phase completion criteria: launch hierarchy criterion works through APIs; all five canonical lists satisfy the shared contract; archives are read-only; class-scoped chart snapshots can be created and listed.

### Implementation Phase 4: Implement upload and authenticated image delivery

- **GOAL-004**: Accept, normalize, order, store, replace, and privately render page images without exposing R2 or exceeding Worker request limits.

- [ ] **TASK-010**: Add page image repositories and one-page multipart ingestion.
  - Create `apps/seating-backend/src/assignment-reader/page-image.repository.ts` for R2/Images operations and keep orchestration in `assignment-reader.service.ts`.
  - Implement one-file endpoints for material-version and submission pages. Read at most 10 MB plus one byte, inspect JPEG/PNG/HEIC signatures and Images `.info()`, normalize via `IMAGES.input(stream).output({ format: 'image/jpeg' })`, and write the canonical stream to the REQ-020 key with `contentType: image/jpeg` metadata.
  - Insert a page in `uploading`, move it to its stored pre-confirmation state only after R2 succeeds, and delete the just-written object if the database write fails. Reject PDF, unknown signatures, empty images, malformed images, the 21st page, historical materials, and archived ancestry.
  - Dependencies: TASK-005 and TASK-007.
  - Acceptance: real JPEG, PNG, and HEIC fixtures yield valid JPEG objects; extension/MIME spoofing, 10 MB + 1 byte, malformed image, PDF, and cross-owner uploads fail without orphan rows or blobs.

- [ ] **TASK-011**: Implement ordering, confirmation, removal, and replacement commands.
  - Add page removal and replacement endpoints plus `POST /api/v1/documents/:documentType/:documentId/confirm` with the complete ordered page-ID array.
  - In one transaction, verify 1–20 unique owned pages belong to the document, rewrite contiguous positions, increment `transcription_revision`, set every page `queued`, and create attempt/audit seeds. After commit, send one `TranscriptionPageMessage` per page with immutable IDs and revision.
  - Replacement creates a new page ID at the same position and schedules the old key through the deletion pipeline; it never reuses a stale page row or lets an old queue message update the replacement.
  - If queue send fails after commit, record the failure code and expose a safe retry-confirm command that sends only pages still queued without a corresponding accepted attempt.
  - Dependencies: TASK-010 and TASK-006.
  - Acceptance: order survives reload, duplicate/foreign page IDs fail atomically, one message is sent per current page, replay does not double-enqueue completed revisions, and replacement invalidates stale jobs.

- [ ] **TASK-012**: Add the authenticated page-image delivery route.
  - Implement `GET /api/v1/pages/:pageId/image` with allow-listed `variant=original|workspace|thumbnail|transcription|region`, validated rotation, and normalized region coordinates.
  - Authorize ownership before R2 access. Stream originals directly and use the Images binding for resize/rotation/crop; immutable page IDs ensure a replacement cannot return stale bytes for the new page.
  - Never return an R2 public URL. Set browser-safe private caching headers and `X-Content-Type-Options: nosniff`.
  - Dependencies: TASK-010.
  - Acceptance: owner can render all variants; unauthenticated/cross-owner requests fail; invalid crop/rotation fails; replacing a page changes the served revision immediately.

- Phase completion criteria: the complete upload contract works against real image bindings, the 20-page boundary is enforced across one-page requests, and every rendered image remains auth-gated.

### Implementation Phase 5: Implement transcription, retry, and progress services

- **GOAL-005**: Produce validated per-page drafts and question segments through an idempotent, observable vision pipeline with safe recovery.

- [ ] **TASK-013**: Implement the OpenRouter vision repository and transcription prompt.
  - Add `apps/assignment-worker/src/transcription/openrouter.repository.ts`, `prompt.ts`, and `output-validator.ts`.
  - Read the canonical R2 JPEG, transform it to a maximum 2048-pixel dimension JPEG through the Images binding, base64 encode only that bounded variant, and send text first followed by the `data:image/jpeg;base64,...` image part.
  - Use `response_format: { type: 'json_schema' }` and provider `require_parameters: true` when the selected endpoint advertises structured-output support. Otherwise use the documented JSON/Response Healing path, then apply the same local validator. In both paths, use the configured primary/fallback model sequence, an AbortController timeout, and a system instruction that image text is untrusted source material rather than executable instruction.
  - Validate schema version, allowed nodes/marks/attributes, size/node/LaTeX bounds, `imageRegion` bounds/page identity, and question-segment fields. Validation failures may be summarized into the next attempt but the raw student response must not be logged.
  - Dependencies: TASK-001, TASK-006, and TASK-012.
  - Acceptance: a real supported page returns valid schema-versioned draft JSON and stable question IDs; invalid/extra nodes and model-supplied grades are rejected.

- [ ] **TASK-014**: Implement the per-page queue consumer and transactional state/audit updates.
  - Add `transcription.service.ts` and `db/transcription.repository.ts`; claim only the message's current `transcription_revision`, move `queued → transcribing`, and no-op/ack completed or stale duplicates.
  - Persist draft, new current question segments, page timing, attempt audit, provider-reported usage/cost when present, and the normalized per-page cost estimate/source in one transaction; set page `completed` only after validation. When the last current page completes, set document review state to `needs_review`.
  - Classify terminal errors per REQ-014. Retry transient provider/timeouts with delayed `message.retry()`; acknowledge terminal invalid-image/output exhaustion after recording `failed`; DLQ handling must preserve an actionable failed state and attempt history.
  - Write Analytics Engine dimensions/measures without content or direct identity.
  - Dependencies: TASK-013 and TASK-011.
  - Acceptance: duplicate delivery is idempotent, stale revision cannot write, successful siblings are never reprocessed due to another page's failure, mixed page states return the REQ-010 rollup, and every accepted or failed attempt has a queryable cost estimate and source.

- [ ] **TASK-015**: Add progress, page retry, and whole-document retranscription APIs.
  - Add processing GET responses with per-page state, safe failure code/message, attempt count, elapsed-from-queued timestamp, rollup counts, and completed-page workspace links.
  - `POST /api/v1/pages/:pageId/retry` accepts failed pages only and increments that page's revision without changing siblings.
  - `POST /api/v1/documents/:documentType/:documentId/retranscribe` requires confirmation and rejects without `overwriteTeacherEdits: true` and `resetQuestionJudgments: true` when applicable. On consent, supersede old segments/reviews, retain audit history, create a new revision, and queue every current page.
  - Dependencies: TASK-014 and TASK-002.
  - Acceptance: retry charges/requeues one page only; full retry rejects missing consent; a stale worker cannot overwrite a teacher edit or judgment; distinct failures expose the correct retry versus replace guidance.

- Phase completion criteria: a real staging image completes from queue to editable draft; all failure classes, retries, DLQ behavior, state rollups, and audit rows are observable and correct.

### Implementation Phase 6: Implement review, grading, and deletion APIs

- **GOAL-006**: Make teacher edits, revision-aware verification, manual grading, materials history, and cross-store deletion authoritative at the server boundary.

- [ ] **TASK-016**: Implement draft editing and revision-aware page review.
  - Add `PATCH /api/v1/pages/:pageId/draft` with validated JSON and required `expectedContentRevision`; update with compare-and-swap and return `409` on stale revision.
  - Increment `content_revision` and `teacher_edit_count`, set `edited_by_teacher`, supersede the current page-review record, and atomically apply REQ-016 state invalidation.
  - Add `POST /api/v1/pages/:pageId/review` to persist the current content revision and `POST /api/v1/documents/:documentType/:documentId/mark-ready` gated on every current page being completed and reviewed at its current revision.
  - Add explicit `return-to-needs-review`; historical material versions and archived classes remain read-only.
  - Dependencies: TASK-007 and TASK-014.
  - Acceptance: autosave survives reload, conflicting edits do not overwrite, stale review evidence cannot unlock readiness, and API calls cannot bypass the full-document gate.

- [ ] **TASK-017**: Implement materials context, question judgments, and submission grading.
  - Add idempotent PAT-002 review-context capture; material version history/current endpoints; and current/historical workspace responses.
  - Add question judgment mutations keyed by current stable segment ID and expected transcription revision; accept only teacher-authored judgment/points/comment fields.
  - Add submission grading draft mutation and `mark-graded`; validate score rules and require `ready_to_grade`. `return-to-needs-review` clears graded state/timestamp but retains draft grading fields for later revision.
  - Add an explicit `apply-question-points-to-score` command that calculates the current awarded-point sum, presents it to the teacher, and applies it only on the teacher's confirmed request.
  - Dependencies: TASK-016.
  - Acceptance: materials have no grading endpoints, no model field can set a grade, uncertain pages work with zero question rows, score limits hold in DB and service, and reopening removes graded visibility without deleting draft judgments.

- [ ] **TASK-018**: Integrate idempotent relational/R2 deletion and account deletion.
  - Add destructive API commands for page, materials document, submission, student data, assignment, and class. Each command creates one operation plus one object row per current/historical key, marks the scope deletion-pending, and enqueues only the operation ID for the TASK-006 cleanup consumer.
  - Ensure each scope enumerates all descendant rows and current/historical R2 keys before it becomes unavailable; relational finalization occurs only after the cleanup consumer marks every object complete.
  - Extend `apps/seating-backend/src/user/user.routes.ts` so account deletion soft-disables access immediately, cancels billing as today, schedules all Assignment Reader keys/data, and returns an accepted/pending response. Update `apps/seating-frontend/src/hooks/use-delete-account.ts` for that response without restoring access.
  - Expose operator-safe status/error fields for DLQ recovery; never include image content or full keys in logs.
  - Dependencies: TASK-006, TASK-007, and TASK-010.
  - Acceptance: page, document, student-data, assignment, class, and account deletion each remove rows and every R2 object; running the same operation twice succeeds; injected mid-batch failure resumes without orphaning or exposing the target.

- Phase completion criteria: all review/grading invariants are server-enforced; historical context remains stable; every deletion scope is replay-safe across Postgres and R2.

### Implementation Phase 7: Build hierarchy and upload frontend surfaces

- **GOAL-007**: Deliver navigable class/assignment management and reusable canonical list/upload UI against the completed contracts.

- [ ] **TASK-019**: Add typed API/query/router foundations.
  - Create `apps/seating-frontend/src/lib/assignment-reader-api.ts`, `src/hooks/use-assignment-reader.ts`, and `src/lib/assignment-reader-query-keys.ts` using the shared schemas and existing `request()` wrapper.
  - Extend `apps/seating-frontend/src/router.tsx` with `/classes`, `/classes/$classId`, `/classes/$classId/assignments/$assignmentId`, upload, processing, and workspace routes. Validate canonical list search params and prefetch with query options.
  - Update the authenticated sidebar so Classes is the single Management entry and remains active across every descendant route; retain Settings and Pricing.
  - Dependencies: TASK-001, TASK-007, and TASK-008.
  - Acceptance: route params/search are type-safe, browser back/forward restores list state, and mutations invalidate only affected query-key branches.

- [ ] **TASK-020**: Build the canonical list and hierarchy surfaces with smart/view separation.
  - Create `apps/seating-frontend/src/components/assignment-reader/canonical-list.tsx` and `canonical-list-view.tsx` as the only sortable/searchable/paginated table implementation.
  - Add smart/view pairs under `src/pages/` and `src/components/assignment-reader/` for Classes, Class Dashboard, roster management, and assignment create/edit. Render exact columns from REQ-003, Assignments/Seating Charts tabs, rename/archive/new actions, explicit class/assignment/student-data deletion confirmations, and read-only archived mode.
  - Add accessible table headers/buttons, labeled search, keyboard row activation, focus-visible states, empty/loading/error states, and 10-row pagination. Do not reproduce mockup-only CSS.
  - Dependencies: TASK-019, TASK-008, TASK-009, and TASK-018.
  - Acceptance: a teacher can complete class/student/assignment setup and invoke every hierarchy-level deletion allowed by REQ-022; every list shares one implementation; deletion-pending targets disappear immediately; archived routes expose no enabled mutation controls; saved charts open from the class tab.

- [ ] **TASK-021**: Build assignment detail and materials/submission management.
  - Add smart/view pairs for current materials, version history, canonical submissions, filters, not-started roster rows, create submission, replacement/retranscription, and context-versus-submission identity labels. Provide explicit confirmations for deleting a current page, the materials document, or a submission.
  - Apply PAT-003 status and score display. Historical materials open in read-only workspace; no materials row contributes to submission totals.
  - Dependencies: TASK-020, TASK-007, TASK-017, and TASK-018.
  - Acceptance: the assignment route shows live processing/review/grading states without contradictory chips, old material versions remain accessible, a not-started student can create exactly one submission, and every document-level deletion allowed by REQ-022 becomes unavailable immediately while cleanup is pending.

- [ ] **TASK-022**: Build the shared ordered upload flow.
  - Add upload smart/view components that accept JPEG/PNG/HEIC, mirror 10 MB/20-page limits, show per-file upload/error/replace/remove state, support keyboard-accessible reordering, and upload each file through an independent one-page request with bounded concurrency 3.
  - Confirmation sends the final page-ID order, starts transcription, and navigates back to assignment detail; leaving the route must not cancel already accepted pages.
  - Treat client checks as UX only and render server validation by row. Never create a presigned URL or one 200 MB request.
  - Dependencies: TASK-011 and TASK-019.
  - Acceptance: both material and submission modes use the same component, page order survives, oversized/spoofed files show actionable replacement errors, and confirmation returns to an independently updating assignment page.

- Phase completion criteria: teachers can establish hierarchy, inspect all canonical lists, save seating charts, create/replace materials, create submissions, order pages, start background transcription, and invoke every teacher-facing deletion scope from production UI.

### Implementation Phase 8: Build processing and unified workspace surfaces

- **GOAL-008**: Deliver the source-first processing, recovery, review, and manual grading experience represented by the reconciled wireframes while preserving the shared state invariants.

- [ ] **TASK-023**: Build processing status and recovery UI.
  - Add smart/view pairs for the canonical Processing table and per-document page detail. Poll with TanStack Query every 3000 ms only while visible and any page is non-terminal; compute elapsed display from queued timestamps without writing timer state to the server.
  - Show completed-page **Review now** actions without a document review chip until all pages complete. Render safe failure taxonomy, page retry, page replacement, and whole-document retranscription confirmation with separate teacher-edit and question-judgment reset consent.
  - Dependencies: TASK-015 and TASK-019.
  - Acceptance: mixed states and counts match API rollup; hidden/unmounted/completed views stop polling; page retry never presents successful pages as requeued; consent copy names re-billing and overwritten teacher work.

- [ ] **TASK-024**: Add the Tiptap editor and stable Assignment Reader document extensions.
  - Add exact dependencies `@tiptap/react@3.31.3`, `@tiptap/pm@3.31.3`, `@tiptap/starter-kit@3.31.3`, `@tiptap/extension-mathematics@3.31.3`, `@tiptap/extension-underline@3.31.3`, and `katex@0.18.9` to `apps/seating-frontend/package.json`; all Tiptap packages stay on the same exact version and the lockfile is committed.
  - Create `src/components/assignment-reader/editor/assignment-editor.tsx`, `math-extension.ts`, `image-region-extension.tsx`, and `document-adapter.ts`. Limit commands/rendering to PAT-001 nodes and marks; implement `imageRegion` as a selectable block atom with no editable child content; never persist or render arbitrary HTML.
  - Debounce autosave, pass `expectedContentRevision`, surface conflict/reload resolution, and mark a page reviewed only by explicit teacher action after the latest save succeeds.
  - Dependencies: TASK-001 and TASK-016.
  - Acceptance: paragraphs, lists, hard breaks, underline, inline/block math, and authenticated image regions round-trip without schema drift; KaTeX cannot trust embedded commands; invalid JSON cannot enter editor state; a 409 never silently discards local edits.

- [ ] **TASK-025**: Build the unified materials/submission workspace.
  - Add smart/view pairs for document identity, original viewer, editor, page navigation, processing placeholders, review controls, materials side rail, and historical read-only mode.
  - Capture submission review context before loading its materials rail. Allow early completed-page editing, but keep document readiness unavailable until all pages complete and every current revision is reviewed.
  - Add zoom/rotation and image-region rendering through TASK-012 only; no public URLs or base64 image data in frontend state.
  - Dependencies: TASK-023, TASK-024, and TASK-017.
  - Acceptance: original and draft remain together across page navigation/reload, materials open without leaving the submission workspace, archived/history mode is read-only, and teacher edits remain authoritative.

- [ ] **TASK-026**: Add manual question grading and submission grading rail.
  - Render one row per current parsed segment with explicit Correct/Incorrect/Unmarked, optional points, and optional comment; show a clear submission-level fallback when there are no segments.
  - Render score/comments and **Mark graded** only for submissions and only when ready; allow the assignment maximum to be set or changed in this rail through the same assignment mutation used by settings. Add separate **Return to Needs review**. Offer explicit **Use question-points sum** confirmation rather than automatic calculation.
  - Retain draft values after reopening but remove the submission from Graded filters/counts immediately.
  - Dependencies: TASK-025 and TASK-017.
  - Acceptance: materials never render grading, readiness cannot be bypassed from UI or direct API, assignment-maximum edits immediately use the same score validation and display contract, score rules produce clear errors, and question edits persist without automatic judgment.

- Phase completion criteria: all product launch criteria for processing, source comparison, correction, material access, review, question judgment, and grading pass through the actual UI.

### Implementation Phase 9: Instrument, disclose, verify, and release

- **GOAL-009**: Prove the complete MVP in staging, publish the privacy contract, and make failures/costs/deletion operable before production promotion.

- [ ] **TASK-027**: Complete metric instrumentation and operational queries.
  - Add structured Analytics Engine writes in API/worker utilities and repository queries over `transcription_attempts`, pages, documents, and grading timestamps for every automatable REQ-025 baseline.
  - Define `pages ever edited` as the MVP correction metric; do not infer correctness or edit magnitude. Emit review-session start/end and materials-open events without document content or direct teacher/student identity.
  - Document queue/DLQ recovery commands and model capability validation in existing operational documentation or scripts; do not create a new standalone README.
  - Dependencies: TASK-014 through TASK-026.
  - Acceptance: staging data can compute latency/failure/conversion/edit/adoption/cost metrics by document type and model; logs and Analytics contain no student content.

- [ ] **TASK-028**: Publish provider, retention, deletion, and AI disclosures.
  - Update `apps/seating-frontend/src/pages/privacy-policy.tsx` and `terms-of-service.tsx` with the approved facts from TASK-003, including student work, prompts, answer keys/rubrics, OpenRouter/downstream provider roles, verified retention/deletion, account-deletion behavior, and whether zero-retention routing is available and selected.
  - Update dates and navigation contents; avoid compliance guarantees not backed by an independent determination.
  - Dependencies: TASK-003 and final deployed provider routing from TASK-013.
  - Acceptance: product/legal approval is recorded; the live staging pages match actual routing and deletion behavior; production deployment is blocked if approval or verified routing/retention evidence is absent. If zero-retention routing is available, the selected controls are recorded and reflected in the disclosure.

- [ ] **TASK-029**: Run focused automated verification and full repository gates.
  - Run package-scoped tests listed in Section 6 as each layer lands, then run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build` once on the integrated tree.
  - Run Wrangler dry deployments for API, frontend, optimizer, email worker, and assignment worker in staging-default and production modes; confirm generated binding types match each `wrangler.jsonc`.
  - Dependencies: TASK-001 through TASK-028.
  - Acceptance: every command exits zero with no skipped Assignment Reader suite, binding error, migration error, or schema mismatch.

- [ ] **TASK-030**: Execute the staging launch-acceptance and failure-recovery scenario.
  - Use two teacher accounts and real JPEG, PNG, and HEIC pages to prove all 11 PRD launch criteria plus cross-tenant denial, mixed processing, each failure class, retry, consented retranscription, materials replacement/history snapshot, archive, all deletion scopes, model-config change, and background polling stop.
  - Verify actual R2 keys and database rows are removed after cleanup, but do not inspect/log image contents. Change the configured model and transcribe a new page; confirm existing teacher-edited drafts are unchanged.
  - Record qualitative teacher trust/review-time baselines outside product telemetry; no in-product survey is added for MVP.
  - Dependencies: TASK-027 through TASK-029.
  - Acceptance: every scenario in Section 6 passes in staging; privacy gate is approved; DLQs are empty or explained; production promotion uses the existing `staging → main` pipeline.

- Phase completion criteria: automated gates and staging smoke pass, privacy/legal and deletion operations are proven, metrics are queryable, and production promotion completes without any unresolved launch blocker.

## 3. Alternatives

- **ALT-001**: Store sanitized HTML drafts. Rejected because math, stable image-region nodes, structural validation, and model/editor round-tripping require a versioned document schema; arbitrary HTML expands the sanitization and migration surface.
- **ALT-002**: Store originals in Cloudflare Images hosted storage. Rejected because R2 provides deterministic private keys, hard-delete control, and inexpensive historical material versions while the Images binding still provides transforms.
- **ALT-003**: Use presigned browser-to-R2 uploads. Rejected for this release because one-page requests remain below the 10 MB product limit, authenticated proxying centralizes validation/ownership, and signing/abort/finalization machinery adds no current user value.
- **ALT-004**: Put vision work in `apps/seating-worker`. Rejected because image inference has independent model config, failure taxonomy, cost profile, queue tuning, and deployment lifecycle.
- **ALT-005**: Add WebSockets, SSE, or Durable Objects for progress. Rejected because provider work produces discrete page completion events and foreground-only 3-second polling meets the user-visible requirement without connection infrastructure.
- **ALT-006**: Retranscribe an entire document on any page failure. Rejected because it re-bills successful pages and creates a larger teacher-edit overwrite risk; page retry is the default.
- **ALT-007**: Combine review and grading into separate routes. Rejected because the original remains necessary while judging work and the PRD explicitly requires one workspace.
- **ALT-008**: Support PDF or multiple named materials attachments. Rejected as explicit MVP exclusions; both require document rasterization or a broader attachment model unrelated to the photo-and-order workflow.

## 4. Dependencies

- **DEP-001**: Existing Better Auth sessions and `requireAuth` middleware in `packages/server` and `apps/seating-backend/src/index.ts`.
- **DEP-002**: Existing Neon Postgres/Hyperdrive connection and ordered migration runner in `database/migrations/` and `scripts/migrate.sh`.
- **DEP-003**: Cloudflare R2, Images binding, Queues/DLQs, Analytics Engine, and generated Workers types in both staging and production accounts.
- **DEP-004**: OpenRouter API access through `LLM_API_KEY` plus operations-approved primary/fallback image-capable model IDs and a verified native-structured-output or validated-JSON response path per environment.
- **DEP-005**: Tiptap/ProseMirror-compatible React editor packages and KaTeX for the schema-versioned draft node set.
- **DEP-006**: Existing TanStack Router, TanStack Query, React, Vite, and same-origin frontend→API service binding.
- **DEP-007**: Existing seating job/results flow for the new save-to-class snapshot command.
- **DEP-008**: Existing staging-default Wrangler and GitHub promotion pipeline, extended to provision/deploy `classprints-transcriber`.
- **DEP-009**: Verified OpenRouter/downstream-provider retention/deletion documentation and product/legal approval of production privacy/terms language.

## 5. Files

- **FILE-001**: `plan/feature-assignment-reader-1.md` — this executable plan.
- **FILE-002**: `database/migrations/20260923090000_create_assignment_reader.sql` — all Assignment Reader tables, constraints, and indexes.
- **FILE-003**: `packages/assignment-reader-shared/**` — versioned domain types, Zod schemas, editor contract, transitions, and queue messages.
- **FILE-004**: `apps/seating-backend/src/assignment-reader/**` — route/controller, service, Postgres repository, image repository, and feature types.
- **FILE-005**: `apps/seating-backend/src/index.ts`, `src/types/env.ts`, generated Worker binding declarations, `wrangler.jsonc`, and `package.json` — route/package/binding integration.
- **FILE-006**: `apps/seating-backend/src/seating/seating.routes.ts`, `seating.service.ts`, and `seating.db.ts` — class-scoped seating-chart save command.
- **FILE-007**: `apps/seating-backend/src/user/user.routes.ts` — account deletion scheduling.
- **FILE-008**: `apps/seating-backend/tests/assignment-reader*.test.ts` and affected seating/user tests — API/service/state/upload/deletion contracts.
- **FILE-009**: `apps/assignment-worker/**` — dedicated transcription and cleanup consumers, OpenRouter/R2/Images repositories, configuration, and tests.
- **FILE-010**: `apps/seating-frontend/src/lib/assignment-reader-api.ts`, `assignment-reader-query-keys.ts`, and `src/hooks/use-assignment-reader.ts` — typed frontend data layer.
- **FILE-011**: `apps/seating-frontend/src/router.tsx` and Assignment Reader page smart/view pairs under `src/pages/` and `src/components/assignment-reader/` — routes and UI surfaces.
- **FILE-012**: `apps/seating-frontend/src/components/assignment-reader/editor/**` — restricted Tiptap editor, math/image-region extensions, and JSON adapters.
- **FILE-013**: `apps/seating-frontend/src/pages/job-detail.tsx` — save-seating-chart-to-class action.
- **FILE-014**: `apps/seating-frontend/src/hooks/use-delete-account.ts`, `src/pages/privacy-policy.tsx`, and `src/pages/terms-of-service.tsx` — pending deletion behavior and approved disclosures.
- **FILE-015**: `apps/seating-frontend/package.json`, `apps/seating-frontend/tests/assignment-reader*.test.tsx`, and `pnpm-lock.yaml` — editor dependencies and focused frontend contract tests.
- **FILE-016**: `scripts/bootstrap.sh`, `.github/workflows/deploy.yml`, and affected environment examples — R2/queue provisioning and worker deployment.

## 6. Testing

- **TEST-001**: Shared contract tests must fail on illegal state transitions, incorrect rollup precedence, duplicate/unknown editor nodes, unsafe source regions, automatic model grading fields, invalid score precision/range, and missing retranscription consent.
- **TEST-002**: Migration verification against isolated Postgres must prove uniqueness, foreign keys, parent exclusivity, partial current-material uniqueness, indexed list predicates, and replay safety.
- **TEST-003**: Backend service tests with in-memory/fake repositories must prove ownership isolation, archived-subtree write denial, one submission per student/assignment, immutable review-context snapshot, assignment aggregate denominator, revision compare-and-swap, readiness gate, grading gate, and retained draft grading data after reopen.
- **TEST-004**: API multipart/image tests must exercise real JPEG/PNG/HEIC fixtures and reject PDF, spoofed MIME, malformed bytes, empty file, 10 MB + 1 byte, 21st page, foreign page, historical material, and archived class; failed DB/R2 halves must leave no orphan.
- **TEST-005**: Transcriber tests must prove valid model-output persistence through the configured native-structured-output and validated-JSON paths, invalid-output retry/exhaustion, timeout classification, stale/duplicate message acknowledgement, per-page isolation, no teacher-edit overwrite, segment supersession, and content-free logging.
- **TEST-006**: Deletion tests must inject failure before R2 delete, mid-batch, and before relational finalization; replay must remove all keys/rows exactly once for page, document, student, assignment, class, and account scopes.
- **TEST-007**: Frontend focused tests must defend canonical URL-backed sort/search/page behavior, background polling stop, partial-page review without document state, upload one-file requests/order confirmation, explicit retranscription consent, editor conflict handling, materials-without-grading, readiness lock, score errors, explicit return-to-review behavior, destructive-action confirmation, and immediate removal of deletion-pending targets.
- **TEST-008**: Security tests must use two teacher accounts to deny cross-tenant list, record, image, retry, grading, chart-save, and delete operations; unauthenticated image responses must never reveal object existence.
- **TEST-009**: Package verification commands are `pnpm --filter @classprints/assignment-reader-shared typecheck`, `pnpm --filter @classprints/api test`, `pnpm --filter @classprints/assignment-worker test`, and `pnpm --filter @classprints/web test`; integrated gates are `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`.
- **TEST-010**: Staging smoke must run the complete canonical scenario with real JPEG/PNG/HEIC input and a live configured model, including material version replacement, early page edit, timeout retry, consented full retranscription, manual question grading, score maximum, archive, cross-owner denial, and every deletion scope.

## 7. Risks & Assumptions

- **RISK-001**: Handwriting, math, erasures, layouts, and diagrams produce variable model quality. Mitigation: originals remain authoritative, output is validated, unsupported content becomes a source region, and teacher review is mandatory.
- **RISK-002**: Per-page image inference can erode flat-subscription margin. Mitigation: 2048-pixel transcription variants, page-only retry, required attempt/cost audit, and deploy-time model configuration; quotas remain intentionally out of scope.
- **RISK-003**: Queue duplication and concurrent retries can write stale drafts. Mitigation: immutable page IDs, transcription revisions, conditional claims/updates, explicit message acknowledgement, and teacher-edit consent guards.
- **RISK-004**: Postgres/R2 deletion is not atomic. Mitigation: durable deletion operation/object rows, immediate tombstoning, idempotent queue cleanup, DLQ visibility, and replay tests.
- **RISK-005**: Provider retention or disclosure may block launch after engineering is complete. Mitigation: TASK-003 begins in Phase 1 and TASK-028 is an explicit production gate.
- **RISK-006**: Editor/model schema drift can make retained drafts unreadable. Mitigation: versioned restricted JSON, shared validator/adapters, no raw HTML, and schema-version tests.
- **RISK-007**: Material replacement can silently alter review context. Mitigation: immutable first-workspace material snapshot and read-only historical versions.
- **RISK-008**: Base64/transform work can pressure the Worker 128 MB memory ceiling. Mitigation: one-page jobs, bounded 2048-pixel inference images, batch size 1, streamed R2/Images operations, and bounded consumer concurrency.
- **RISK-009**: Future mockup revisions can reintroduce state-copy drift. Mitigation: mockups, shared state functions, and tests use the same PRD lifecycle rules documented in the introduction.
- **ASSUMPTION-001**: The existing Better Auth, Neon/Hyperdrive, billing, email, rate-limit, Analytics Engine, and staging→production pipeline remain operational while this work lands.
- **ASSUMPTION-002**: One submission per student per assignment is the intended MVP invariant reflected by the functional schema and all wireframes.
- **ASSUMPTION-003**: OpenRouter remains the initial provider gateway; operations supplies approved model IDs, and deployment fails rather than choosing an unverified fallback when IDs are absent or endpoints cannot accept image input.
- **ASSUMPTION-004**: Student users do not exist in the MVP, so answer keys/rubrics require provider disclosure but no student-facing visibility control.
- **ASSUMPTION-005**: Archived classes are not restorable in this release.
- **ASSUMPTION-006**: Qualitative trust and paper-workflow comparison are measured through product research, not an in-product survey added to this implementation.

## 8. Related Specifications / Further Reading

- [Assignment Reader Product Requirements](assignment-reader/product-doc.md)
- [Assignment Reader Infrastructure Analysis](assignment-reader/functional-spec.md)
- [Assignment Reader API Manifest](assignment-reader/api-manifest.md)
- [Assignment Reader Mockup Specification](assignment-reader/mockups/SPEC.md)
- [Assignment Reader Mockup Overview](assignment-reader/mockups/index.html)
- [Staging → Production Pipeline](infrastructure-staging-prod-pipeline-1.md)
- [Cloudflare Images binding](https://developers.cloudflare.com/images/optimization/binding/)
- [Cloudflare Images limits and formats](https://developers.cloudflare.com/images/get-started/limits/)
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloudflare Queues batching and retries](https://developers.cloudflare.com/queues/configuration/batching-retries/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
