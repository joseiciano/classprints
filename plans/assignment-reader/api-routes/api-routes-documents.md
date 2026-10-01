# Assignment Reader API — Document, Upload, and Processing Routes

**Status:** Planned  
**Base path:** `/api/v1`  
**Audience:** Assignment Reader API, frontend, worker, and test implementers

Route contracts for material versions, submissions, page upload and ordering, authenticated image delivery, and processing recovery. Authentication, envelopes, errors, and `CanonicalListQuery` are defined in [`api-manifest.md`](api-manifest.md) §1. Every named request, response, query, and result type referenced here is defined once in [`api-types.md`](api-types.md); this file does not redefine wire types. Status codes not listed per route follow manifest §1.4.

### Shared state and revision rules

- `documentRevision` is document-scoped. It increments exactly once for each committed mutation that changes the current ordered page set or generated content. Reordering current pages increments it; a state-only transition or queue-delivery retry does not.
- `pageRevision` is page-transcription-scoped. A new page starts at revision 1. Reprocessing or replacing that page increments it. A replacement has a new immutable page ID but carries the superseded page's next `pageRevision`. Unchanged siblings keep their revisions.
- `contentRevision` is teacher-edit-scoped and is not incremented by upload, replacement, retry, or retranscription. `QuestionSegment.pageRevision` identifies the generated page content from which a segment came.
- `attemptCount` is the number of worker executions accepted for the current `pageRevision`. It resets to zero whenever `pageRevision` changes and increments when the worker accepts an execution. HTTP/queue delivery retries and provider retries inside one accepted execution do not increment it. Attempt audit history beyond the current revision is internal and is not part of these API responses.
- An unconfirmed, partially processed, or failed document has `reviewState: null`. Once every current page is `completed`, the document transitions to `reviewState: "needs_review"`. Marking a document ready requires a non-empty, confirmed set in which every current page is completed and reviewed.
- Every current page-set or generated-content change invalidates readiness. For a submission it also atomically sets `gradingState: "not_graded"` and `gradedAt: null`; score and comments remain unless explicitly reset. Judgments whose segments remain current also remain. A judgment tied to a removed or superseded `pageRevision` is retained only as internal audit history and is omitted from current workspace/grading responses; an explicit judgment reset may remove even that retained association.
- A page draft edit, specified by the workspace routes, increments only `contentRevision`, clears that page's review, sets the document to `needs_review` if all current pages remain completed and otherwise to `null`, and applies the same submission grading invalidation while retaining grading values.
- `ProcessingCounts.total` is always `uploading + queued + transcribing + completed + failed`. Consumers must not infer that every payload containing `ProcessingCounts` also contains `pageCount`.
- Reads under archived ancestry remain available. Non-delete mutations under archived ancestry return `409 ARCHIVED_ANCESTRY`; ordinary delete routes remain available. A non-owned resource is indistinguishable from a missing resource and returns `404 RESOURCE_NOT_FOUND`.
- Historical material reads are explicitly supported by `GET /material-versions/:materialVersionId`, `GET /documents/:documentType/:documentId/processing`, `GET /documents/:documentType/:documentId`, `GET /documents/:documentType/:documentId/workspace`, `GET /pages/:pageId`, and `GET /pages/:pageId/image`. Historical representations are read-only and omit mutation actions. Every mutation aimed at a historical version or one of its pages returns `409 HISTORICAL_VERSION_READ_ONLY`.
- After an ordinary delete is accepted, all routes other than replay of that same delete treat the target as missing and return `404 RESOURCE_NOT_FOUND`. A delete route checks for the authenticated teacher's pending operation before looking up its now-hidden target: the first accepted request returns `202`, a pending replay returns `200` with the same operation, and a replay after cleanup completed returns `404`. Physical cleanup is replayed internally from the deletion operation.

## 1. Materials and submission routes

### 1.1 List material versions

`GET /assignments/:assignmentId/material-versions`

- Preconditions: the assignment exists and is owned by the authenticated teacher. Active and archived ancestry are accepted.
- Path: `assignmentId: UUID`.
- Query: `page?: number` only. This version-history list is the explicit exception to the canonical-list contract: it has no search or caller-selected sort, uses `version desc`, has page size 10, and uses `id asc` as its stable tiebreak.
- Body: none.
- Response `200`: `ListResponse<MaterialVersionSummary>`, including current, draft, and historical versions that are not deletion-pending.
- Errors: `400`, `401`, `404`.
- State/recovery: this read changes no state and is safe to retry unchanged.

### 1.2 Create a draft material version

`POST /assignments/:assignmentId/material-versions`

- Preconditions: the assignment exists under active ancestry. At most one draft may exist per assignment.
- Path: `assignmentId: UUID`.
- Query: none.
- JSON body: empty object `{}`.
- Response `201`: `DataResponse<MaterialVersionSummary>` for a newly created empty version with `lifecycle: "draft"`, `documentRevision: 1`, no pages, null processing/review state, and zero processing counts.
- Replay response `200`: the existing draft when one already exists; no new version or revision is created.
- Errors: `400`, `401`, `404`, `409`.
- State/recovery: creation does not alter the current or historical version. A `409 ARCHIVED_ANCESTRY` is recoverable only by restoring active ancestry; retrying a successful request returns the draft.

### 1.3 Get a material version

`GET /material-versions/:materialVersionId`

- Preconditions: the version exists and is owned by the authenticated teacher. Draft, current, historical, active-ancestry, and archived-ancestry versions are readable.
- Path: `materialVersionId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<MaterialVersionSummary>`; historical versions have `readOnly: true`.
- Errors: `401`, `404`.
- State/recovery: this read changes no state and is safe to retry unchanged. A deletion-pending or completed-deletion target returns `404`.

### 1.4 Delete all assignment materials

`DELETE /assignments/:assignmentId/materials`

- Preconditions: the assignment exists and is owned by the authenticated teacher. Deletion is allowed under archived ancestry.
- Path: `assignmentId: UUID`.
- Query/body: none.
- Response `202`: `DataResponse<DeletionOperation>` on first acceptance.
- Replay response `200`: the same pending `DeletionOperation`.
- Errors: `401`, `404`, `409`.
- Atomic effect: the draft, current version, every historical version, their relational history, and associated R2 objects become deletion-pending and immediately disappear from every non-delete route. Submissions are not deleted. A submission's immutable context ID is not cleared before cleanup removes the referenced material data.
- Recovery: internal cleanup retries the pending operation. Once cleanup completes, both target lookup and another delete return `404`; the teacher does not recreate or poll the operation through another route.

### 1.5 List assignment submissions and not-started students

`GET /assignments/:assignmentId/submissions`

- Preconditions: the assignment exists and is owned by the authenticated teacher. Active and archived ancestry are accepted.
- Path: `assignmentId: UUID`.
- Query: `CanonicalListQuery<"createdAt" | "studentName" | "status", SubmissionListStatus>`.
- Accepted `status` filters are exactly the displayed granular values `not_started`, `uploading`, `queued`, `transcribing`, `error`, `needs_review`, `ready_to_grade`, and `graded`. There is no aggregate `processing` filter.
- Defaults: `sort=studentName`, `direction=asc`, `page=1`. Search covers the displayed Date, Name, and Status values.
- `sort=status` orders by `displayStatus` rank: `not_started`, `uploading`, `queued`, `transcribing`, `error`, `needs_review`, `ready_to_grade`, `graded`. `direction=desc` reverses that rank. Every sort uses `studentId asc` as the final stable tiebreak. For `sort=createdAt`, null values are last in both directions.
- Body: none.
- Response `200`: `ListResponse<SubmissionListItem>`. Selecting a `not_started` row opens the create-submission flow; it does not navigate to a nonexistent submission.
- Errors: `400`, `401`, `404`.
- State/recovery: this read changes no state and is safe to retry unchanged.

### 1.6 Create or return a student's submission

`POST /assignments/:assignmentId/submissions`

- Preconditions: the assignment and requested active roster student exist under active ancestry, the student belongs to the assignment's class, and neither target is deletion-pending.
- Path: `assignmentId: UUID`.
- Query: none.
- JSON body: `CreateSubmissionBody`.
- Response `201`: `DataResponse<CreateSubmissionResult>` with `created: true` and a new empty submission whose `documentRevision` is 1, page set is unconfirmed, processing/review states are null, grading state is `not_graded`, and processing counts are zero.
- Replay response `200`: the unique existing `(assignmentId, studentId)` submission with `created: false`; no revision or state changes.
- Errors: `400`, `401`, `404`, `409`.
- Recovery: correct invalid membership or restore active ancestry before retrying. Retrying after a committed success returns the existing submission rather than creating a duplicate.

### 1.7 Get a submission

`GET /submissions/:submissionId`

- Preconditions: the submission exists and is owned by the authenticated teacher. Active and archived ancestry are accepted.
- Path: `submissionId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<SubmissionRecord>`.
- Errors: `401`, `404`.
- State/recovery: this read changes no state and is safe to retry unchanged. A deletion-pending or completed-deletion submission returns `404`.

### 1.8 Capture immutable review context

`POST /submissions/:submissionId/review-context`

- Preconditions: the submission exists, is not deletion-pending, and is under active ancestry. Its assignment may have no current material version.
- Path: `submissionId: UUID`.
- Query: none.
- JSON body: empty object `{}`.
- Response `201`: `DataResponse<ReviewContextResult>` when the route first stores the assignment's current material-version ID or `null`.
- Replay response `200`: the already stored context with `created: false`; it never follows replacement materials.
- Errors: `400`, `401`, `404`, `409`.
- State/recovery: capture changes neither document/page/content revisions nor review/grading state. Retrying a committed request returns the immutable stored value. Archived ancestry returns `409 ARCHIVED_ANCESTRY`.

### 1.9 Delete a submission

`DELETE /submissions/:submissionId`

- Preconditions: the submission exists and is owned by the authenticated teacher. Deletion is allowed under archived ancestry.
- Path: `submissionId: UUID`.
- Query/body: none.
- Response `202`: `DataResponse<DeletionOperation>` on first acceptance.
- Replay response `200`: the same pending `DeletionOperation`.
- Errors: `401`, `404`, `409`.
- Atomic effect: the submission, its pages, drafts, judgments, grading record, and associated objects become deletion-pending and immediately return `404` from every non-delete route.
- Recovery: internal cleanup retries the operation. After completion, another delete returns `404`.

## 2. Page upload, ordering, and image routes

### 2.1 Upload one material page

`POST /material-versions/:materialVersionId/pages`

- Preconditions: the target is an owned, writable draft under active ancestry, is not deletion-pending, and has fewer than 20 current pages. Current successful materials must be changed by creating a new draft version; a historical target returns `409 HISTORICAL_VERSION_READ_ONLY`.
- Path: `materialVersionId: UUID`.
- Query: none.
- Content type: `multipart/form-data`.
- Form field: exactly one non-empty `file`, at most 10,000,000 bytes. The server reads at most 10,000,001 bytes and accepts JPEG, PNG, or HEIC only after byte-signature validation and image decode.
- Response `201`: `DataResponse<PageSummary>`.
- Errors: `400`, `401`, `404`, `409`, `413`, `415`.
- Atomic effect: normalize the source to the canonical unrotated JPEG, persist it, append an unconfirmed page at the provisional last position with `pageRevision: 1`, `attemptCount: 0`, and `processingState: "uploading"`, increment `documentRevision` once, and set `reviewState: null`. No queue delivery occurs before confirmation.
- Recovery: validation/storage failure commits no page or revision. Correct the file or page limit and retry; successful requests are not implicitly deduplicated, so clients must not replay an ambiguous success as a new upload.

### 2.2 Upload one submission page

`POST /submissions/:submissionId/pages`

- Preconditions: the owned submission exists under active ancestry, is not deletion-pending, and has fewer than 20 current pages.
- Path: `submissionId: UUID`.
- Query: none.
- Content type and `file` field: identical to §2.1.
- Response `201`: `DataResponse<PageSummary>`.
- Errors: `400`, `401`, `404`, `409`, `413`, `415`.
- Atomic effect: normalize and persist the canonical unrotated JPEG; append a page with `pageRevision: 1`, `attemptCount: 0`, and `processingState: "uploading"`; increment `documentRevision` once; make the page set unconfirmed; set `reviewState: null`, `gradingState: "not_graded"`, and `gradedAt: null`; retain score, comments, and judgments. Existing sibling pages and their `pageRevision` values are unchanged.
- Confirmed-set rule: adding a page after an earlier confirmation invalidates that confirmation. The complete current set must be confirmed again through §2.5 before the new page can be queued; completed siblings are not retranscribed by that confirmation.
- Recovery: validation/storage failure commits no page or revision. Correct the request and retry; do not replay an ambiguous successful upload because it would append another page.

### 2.3 Replace a page image

`POST /pages/:pageId/replace`

- Preconditions for an unconfirmed page: the current page belongs to an owned, active, non-historical document; any unconfirmed processing state is accepted and the replacement remains unconfirmed.
- Preconditions for a confirmed page: only `processingState: "failed"` is accepted. This is failed-page recovery, including for current materials. Replacing a successful current-material page requires a new draft material version. Any other confirmed state returns `409 INVALID_STATE`; a historical material page returns `409 HISTORICAL_VERSION_READ_ONLY`.
- Path: `pageId: UUID`.
- Query: none.
- Content type and `file` field: identical to §2.1.
- Response `201`: `DataResponse<ReplacePageResult>`.
- Errors: `400`, `401`, `404`, `409`, `413`, `415`, `500`.
- Atomic effect: create a new immutable page ID at the same position, set its `pageRevision` to the replaced page's revision plus one, reset `attemptCount` and all attempt timestamps/failure to their initial values, increment `documentRevision` once, make the old page unavailable immediately, and schedule its object deletion. Stale queue messages for the old ID cannot update the replacement. Readiness is invalidated; a submission is also returned to `not_graded` with `gradedAt: null` while retaining score, comments, and judgments on unaffected current segments. Judgments from the replaced page remain internal audit history only and are omitted from current responses.
- Resulting unconfirmed state: the new page is `uploading`, the document stays unconfirmed with `reviewState: null`, and nothing is enqueued.
- Resulting confirmed-recovery state: the document stays confirmed, the new page is `queued`, and queue delivery begins automatically; `reviewState` is null until every current page completes.
- Recovery: if queue send fails after the confirmed replacement commits, return `500 QUEUE_DELIVERY_FAILED`; the queued replacement and new revisions remain committed and §2.6 is the only teacher-facing delivery recovery. File validation/storage failure before commit leaves the old page current and changes nothing.

### 2.4 Remove a page

`DELETE /pages/:pageId`

- Preconditions: the page is current, owned, and non-historical. Deletion is allowed under archived ancestry. A page in a draft material version or a submission may be removed; a page from current successful materials requires a new draft version and returns `409 INVALID_STATE`.
- Path: `pageId: UUID`.
- Query/body: none.
- Response `202`: `DataResponse<DeletionOperation>` on first acceptance.
- Replay response `200`: the same pending `DeletionOperation`.
- Errors: `401`, `404`, `409`.
- Atomic effect: remove the page from the current set, compact remaining positions, increment `documentRevision` once without changing sibling `pageRevision` values, invalidate readiness, and schedule object cleanup. The page immediately returns `404` outside replay of this delete.
- Resulting state: an already unconfirmed document remains unconfirmed. Removing from a confirmed submission makes the remaining set unconfirmed and requires §2.5 again, sets `reviewState: null`, sets grading to `not_graded` with null `gradedAt`, and retains score, comments, and judgments on remaining current segments. Judgments from the removed page are omitted from current responses and may remain only as internal audit history. Removing the last page leaves an empty document that cannot be confirmed or marked ready.
- Recovery: internal cleanup retries a pending delete. A pending replay returns `200`; after cleanup another delete returns `404`.

### 2.5 Confirm page order and begin transcription

`POST /documents/:documentType/:documentId/confirm`

- Preconditions: the owned document is under active ancestry, is not deletion-pending or historical, has an unconfirmed set of 1–20 current pages, and the body supplies each current page ID exactly once. For `documentType=materials`, the document must be a draft; for `submission`, it must be the submission's current page set. Empty documents return `409 INVALID_STATE`.
- Path: `documentType: DocumentType`; `documentId: UUID` is a material-version ID for `materials` and a submission ID for `submission`.
- Query: none.
- JSON body: `ConfirmDocumentBody`.
- Response `202`: `DataResponse<ConfirmDocumentResult>`.
- Errors: `400`, `401`, `404`, `409`, `500`.
- Atomic effect: persist the supplied contiguous order, mark the set confirmed, and change each unprocessed `uploading` page to `queued`. Completed current pages remain completed and are not re-enqueued. If the confirmed order differs from the stored current order, increment `documentRevision` once; confirmation itself does not increment it when upload/deletion already established the same order. Page revisions do not change.
- Resulting review state: `needs_review` if every current page is already completed; otherwise null. Submission grading invalidation caused by a preceding page-set change remains in force.
- Material promotion: the confirmed draft atomically becomes current and the prior current version becomes historical. No submission review context changes retroactively.
- Repeated-confirm rule: once acceptance commits, another confirm returns `409 INVALID_STATE`, including after a queue-send failure. Confirm is not a delivery-retry endpoint.
- Recovery: queue-send failure after commit returns `500 QUEUE_DELIVERY_FAILED`; the confirmed order, material promotion, queued states, and revisions remain committed. Use §2.6 to deliver only eligible queued revisions. Pre-commit validation failure changes nothing and is corrected by submitting the exact current page set.

### 2.6 Retry queue delivery

`POST /documents/:documentType/:documentId/retry-confirm`

- Preconditions: the current owned, non-historical document has at least one current `pageRevision` in `queued` state for which no worker execution has been accepted. This route is only queue-delivery recovery after a committed confirm, confirmed-page replacement, page retry, or retranscription. It is not a second confirmation or a processing retry.
- Path: `documentType: DocumentType`, `documentId: UUID`.
- Query: none.
- JSON body: empty object `{}`.
- Response `202`: `DataResponse<ConfirmDocumentResult>` when delivery of all currently eligible revisions succeeds.
- Errors: `400`, `401`, `404`, `409`, `500`.
- Atomic effect: send only current queued revisions with no accepted execution. It changes no page/document/content revision, order, review/grading value, or `attemptCount`. Accepted, transcribing, completed, failed, superseded, and already delivered revisions are never double-enqueued.
- Recovery: if no eligible revision exists, return `409 INVALID_STATE`. A further delivery failure returns `500 QUEUE_DELIVERY_FAILED`; successful sends remain eligible-excluded, and the same endpoint may be retried for only the still-undelivered revisions.

### 2.7 Deliver an authenticated page image

`GET /pages/:pageId/image`

- Preconditions: the page exists, is not deletion-pending, and is owned by the authenticated teacher. Current and historical material pages and pages under archived ancestry are readable.
- Path: `pageId: UUID`.
- Query: `PageImageQuery`; `variant` defaults to `workspace` and `rotation` to `0`.
- Variant semantics:
  - `original`: use the full canonical JPEG at its stored pixel dimensions; do not resize.
  - `workspace`: use the full canonical image and contain it within `1600 × 1600` pixels.
  - `thumbnail`: use the full canonical image and contain it within `320 × 320` pixels.
  - `transcription`: use the full canonical image and contain it within `2048 × 2048` pixels.
  - `region`: return the exact requested canonical-image crop at its resulting pixel dimensions; do not resize.
- Resized variants preserve aspect ratio, never crop, and never upscale. Apply the requested clockwise rotation after selecting/cropping the canonical source and before any variant resize.
- Region validation: `x`, `y`, `width`, and `height` are all required only for `variant=region`; coordinates are normalized against the canonical unrotated JPEG, with `x,y` in `[0,1]`, positive width/height at most 1, `x + width <= 1`, and `y + height <= 1`. Crop fields are rejected for other variants.
- Transform order: validate bounds and crop in canonical-image coordinates first, then apply the requested clockwise rotation to the cropped output. Rotation never changes the coordinate system supplied by the client.
- Body: none.
- Response `200`: binary `image/jpeg` with `Content-Type: image/jpeg`, `X-Content-Type-Options: nosniff`, and private browser caching headers; never a public or presigned R2 URL.
- Errors: `400`, `401`, `404`, `415`, `500` using `ApiErrorResponse`.
- State/recovery: this read changes no state. Correct invalid transform parameters or retry a transient image transformation/storage failure unchanged.

## 3. Processing and recovery routes

### 3.1 Get paginated document processing state

`GET /documents/:documentType/:documentId/processing`

- Preconditions: the document exists, is not deletion-pending, and is owned by the authenticated teacher. Current submissions plus draft, current, and historical material versions under active or archived ancestry are readable.
- Path: `documentType: DocumentType`, `documentId: UUID`.
- Query: `CanonicalListQuery<"uploadedAt" | "label" | "processingState", ProcessingState>`.
- Defaults: `sort=uploadedAt`, `direction=asc`, `page=1`.
- Body: none.
- Response `200`: `DocumentProcessingResponse`, whose revision field is `documentRevision` and whose page entries expose each page's `pageRevision`.
- Errors: `400`, `401`, `404`.
- Rollup: precedence is `failed`, `uploading`, `transcribing`, `queued`, then `completed`. An unconfirmed, partial, or failed document has `reviewState: null`; a confirmed document whose current pages are all completed transitions to `needs_review`. `processingCounts.total` is the sum of its five state counts.
- Failure detail: each `ProcessingPageItem.failure` carries the page-level taxonomy `provider_timeout`, `provider_rejected`, `invalid_output`, `storage_failure`, or `invalid_image`; failures do not add a document-level processing state.
- State/recovery: this read changes no state and is safe to retry unchanged. A historical response is read-only and exposes no mutation actions.

### 3.2 Get document aggregate state

`GET /documents/:documentType/:documentId`

- Preconditions: the document exists, is not deletion-pending, and is owned by the authenticated teacher. Current submissions plus draft, current, and historical material versions under active or archived ancestry are readable.
- Path: `documentType: DocumentType`, `documentId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<DocumentAggregate>` with `documentRevision`, confirmation state, processing/review rollups, and counts.
- Errors: `401`, `404`.
- State/recovery: this read changes no state and is safe to retry unchanged. Historical aggregates are read-only and expose no mutation actions. The aggregate supports navigation without fetching the page list first.

### 3.3 Retry one failed page

`POST /pages/:pageId/retry`

- Preconditions: the page is current, confirmed, owned, non-historical, and exactly `processingState: "failed"`; its document is under active ancestry and is not deletion-pending. Any other page state returns `409 INVALID_STATE`.
- Path: `pageId: UUID`.
- Query: none.
- JSON body: empty object `{}`.
- Response `202`: `DataResponse<RetryPageResult>`.
- Errors: `400`, `401`, `404`, `409`, `500`.
- Atomic effect: increment only the target `pageRevision` and the owning `documentRevision`, reset `attemptCount` to zero, clear its prior failure and attempt timestamps/generated content, set it to `queued`, and leave sibling page revisions/content untouched. Set document review state to null. For a submission, set grading to `not_graded` with null `gradedAt`, retain score/comments and judgments on unaffected current segments, and omit judgments tied to the superseded page revision from current responses; those stale rows may remain only as internal audit history.
- Resulting state: the document remains confirmed and processing resumes for only that page. An accepted worker execution increments `attemptCount`; delivery and provider retries do not.
- Recovery: a queue-send failure after commit returns `500 QUEUE_DELIVERY_FAILED`; the new queued revisions remain committed and §2.6 retries only delivery. A pre-commit state conflict changes nothing; refresh the page rather than replaying the processing retry.

### 3.4 Retranscribe a complete document

`POST /documents/:documentType/:documentId/retranscribe`

- Preconditions: the owned, non-empty, confirmed, non-historical document is under active ancestry, is not deletion-pending, and every current page is `completed`. `RetranscribeDocumentBody.expectedDocumentRevision` must equal the current document revision; otherwise return `409 REVISION_CONFLICT` with the current revision metadata.
- Path: `documentType: DocumentType`, `documentId: UUID`.
- Query: none.
- JSON body: `RetranscribeDocumentBody`.
- Consent: `confirmed` must be `true`; `overwriteTeacherEdits` must be `true` when any current page was teacher-edited; `resetQuestionJudgments` must be `true` when a submission has current judgments. Missing required consent returns `409 CONSENT_REQUIRED` and commits nothing.
- Response `202`: `DataResponse<ConfirmDocumentResult>`.
- Errors: `400`, `401`, `404`, `409`, `500`.
- Atomic effect: increment `documentRevision` once and every current page's `pageRevision` once, reset each page's `attemptCount` to zero, clear superseded generated content/failures/attempt timestamps, and queue every current page without changing page IDs, order, or `contentRevision`. All old segments cease to be current. Set review state to null. For a submission, apply the consented judgment reset so stale judgments are absent from current responses, set grading to `not_graded` with null `gradedAt`, and retain score/comments; any longer-lived judgment audit is internal only.
- Resulting state: the confirmed document has every current page `queued`; no sibling is exempt from whole-document retranscription.
- Recovery: queue-send failure after commit returns `500 QUEUE_DELIVERY_FAILED`; all new revisions and queued states remain committed and §2.6 retries delivery without creating another revision. Revision or consent conflicts commit nothing and require a fresh read before a new command.
