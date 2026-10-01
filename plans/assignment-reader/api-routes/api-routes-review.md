# Assignment Reader API — Workspace, Review, Grading, and Deletion Routes

**Status:** Planned  
**Base path:** `/api/v1`  
**Audience:** Assignment Reader API, frontend, and test implementers

Route contracts for the review workspace, draft editing, page review, document readiness, question judgments, submission grading, and account deletion. Authentication, envelopes, errors, and the canonical list query are defined in [`api-manifest.md`](api-manifest.md) §1; every referenced type is defined in [`api-types.md`](api-types.md). Status codes not listed per route follow manifest §1.4.

## 1. Workspace, editing, and review routes

### 1.1 Get a document workspace

`GET /documents/:documentType/:documentId/workspace`

- Path: `documentType: DocumentType`, `documentId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<DocumentWorkspace>`.
- Errors: `401`, `404`.

The response contains page summaries, not every page's potentially 1 MiB draft. The client loads the active page through §1.2. For submissions, the client must call the review-context command (defined in `api-routes-documents.md` §1.8) before this route so the returned context cannot change during the review session.

This read is available for the current document and historical material versions, including versions under archived class ancestry. A historical or archived workspace has `readOnly: true` and omits every mutation from `allowedActions`; its current pages remain navigable through §1.2.

### 1.2 Get one page's editable workspace data

`GET /pages/:pageId`

- Path: `pageId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<PageWorkspace>`.
- Errors: `401`, `404`, `409` when the page is not completed.

Despite the response type's name, this is also the canonical read route for a completed page in a historical material version or under archived ancestry. Those pages remain readable but are not mutable.

### 1.3 Save an edited page draft

`PATCH /pages/:pageId/draft`

- Path: `pageId: UUID`.
- Query: none.
- JSON body: `UpdatePageDraftBody`.
- Response `200`: `DataResponse<PageWorkspace>` containing the incremented `contentRevision`.
- Errors: `400`, `401`, `404`, `409`.

This command is allowed only for a current page whose `processingState` is `completed`. A page in a historical material version returns `409 HISTORICAL_VERSION_READ_ONLY`; a current page under archived ancestry returns `409 ARCHIVED_ANCESTRY`. A stale `expectedContentRevision` returns `409 REVISION_CONFLICT` with the current value in `context.currentContentRevision`.

On success, the command increments only `contentRevision` and `teacherEditCount`, sets `editedByTeacher: true`, and clears that page's `reviewedContentRevision` and `reviewedAt`. It does not increment `pageRevision` or `documentRevision`. The parent document becomes `needs_review` when all current pages are still completed and otherwise has `reviewState: null`. For a submission it also sets `gradingState: "not_graded"` and `gradedAt: null`, while retaining the existing score, comments, and question judgments.

### 1.4 Review the current page revision

`POST /pages/:pageId/review`

- Path: `pageId: UUID`.
- Query: none.
- JSON body: `ReviewPageBody`.
- Response `200`: `DataResponse<ReviewPageResult>`.
- Errors: `400`, `401`, `404`, `409`.

This command is allowed only for a current, completed page while the parent document has `reviewState: null` or `reviewState: "needs_review"`; a ready-to-grade document or graded submission returns `409 INVALID_STATE`. Historical and archived write attempts return `409 HISTORICAL_VERSION_READ_ONLY` and `409 ARCHIVED_ANCESTRY`, respectively. A stale `expectedContentRevision` returns `409 REVISION_CONFLICT` with `context.currentContentRevision`.

On success, the command records the page's current `contentRevision` as `reviewedContentRevision` and sets `reviewedAt`. It does not change `contentRevision`, `pageRevision`, `documentRevision`, or any grading value or state. The result's `allCurrentPagesReviewed` is true only when every current page is completed and reviewed at its current `contentRevision`. The document has `reviewState: "needs_review"` when every current page is completed and `reviewState: null` while any current page is incomplete; reviewing a page never moves the document directly to `ready_to_grade`.

### 1.5 Mark a document ready to grade

`POST /documents/:documentType/:documentId/mark-ready`

- Path: `documentType: DocumentType`, `documentId: UUID`.
- Query: none.
- JSON body: `DocumentRevisionCommandBody`.
- Response `200`: `DataResponse<DocumentStateResult>`.
- Errors: `400`, `401`, `404`, `409`.

This command is allowed only for a nonempty current document in `needs_review` when every current page is completed and each page's `reviewedContentRevision` equals its current `contentRevision`. Empty, unconfirmed, partial, failed, already-ready, or graded documents return `409 INVALID_STATE`. A stale `expectedDocumentRevision` returns `409 REVISION_CONFLICT`. Historical and archived write attempts return `409 HISTORICAL_VERSION_READ_ONLY` and `409 ARCHIVED_ANCESTRY`, respectively.

On success, `reviewState` becomes `ready_to_grade`. A material keeps `gradingState: null`; a submission keeps `gradingState: "not_graded"` and `gradedAt: null`. Existing score, comments, and question judgments are retained. No content, page, or document revision is incremented, and the response returns the unchanged `documentRevision`.

### 1.6 Return a document to needs review

`POST /documents/:documentType/:documentId/return-to-needs-review`

- Path: `documentType: DocumentType`, `documentId: UUID`.
- Query: none.
- JSON body: `DocumentRevisionCommandBody`.
- Response `200`: `DataResponse<DocumentStateResult>`.
- Errors: `400`, `401`, `404`, `409`.

This command is allowed only for a current document in `ready_to_grade`, including a submission whose `gradingState` is either `not_graded` or `graded`. A document already in `needs_review` or with `reviewState: null` returns `409 INVALID_STATE`; a stale `expectedDocumentRevision` returns `409 REVISION_CONFLICT`. Historical and archived write attempts return `409 HISTORICAL_VERSION_READ_ONLY` and `409 ARCHIVED_ANCESTRY`, respectively.

On success, `reviewState` becomes `needs_review`, and every current page's `reviewedContentRevision` and `reviewedAt` are cleared so the full document must be reviewed again before §1.5 can succeed. Draft content is preserved. A material keeps `gradingState: null`; a submission becomes `gradingState: "not_graded"` with `gradedAt: null`, while retaining its score, comments, and question judgments. No content, page, or document revision is incremented, and the response returns the unchanged `documentRevision`.

## 2. Question judgment and grading routes

These routes exist only for submissions. Calling them for material pages or documents returns `404 RESOURCE_NOT_FOUND` rather than creating a parallel grading surface for materials. Question-judgment, grading-draft, and apply-total mutations are allowed while the current completed submission has `gradingState: "not_graded"` and `reviewState` is either `needs_review` or `ready_to_grade`; draft grading work does not require readiness. A graded submission must first pass through §1.6 before those values can be edited and must pass through page review and §1.5 again before it can be marked graded. Writes under archived ancestry return `409 ARCHIVED_ANCESTRY`.

### 2.1 Update one question judgment

`PUT /pages/:pageId/question-segments/:segmentId/judgment`

- Path: `pageId: UUID`, `segmentId: UUID`.
- Query: none.
- JSON body: `UpdateQuestionJudgmentBody`.
- Response `200`: `DataResponse<QuestionJudgment>`.
- Errors: `400`, `401`, `404`, `409`.

The page must be a current, completed page of the current completed submission, with `gradingState: "not_graded"` and `reviewState` equal to `needs_review` or `ready_to_grade`; other lifecycles return `409 INVALID_STATE`. The segment must belong to that page and to its current `pageRevision`; an obsolete segment or a segment outside the addressed page returns `404 RESOURCE_NOT_FOUND`. A stale `expectedPageRevision` returns `409 REVISION_CONFLICT` with the current page revision in the error context.

On success, only the addressed segment's teacher-authored judgment, awarded points, comment, and update timestamp change. The command does not alter the submission score, page review, `reviewState`, `gradingState`, `gradedAt`, `contentRevision`, `pageRevision`, or `documentRevision`. Model fields cannot call or populate this route.

### 2.2 Update submission grading draft

`PATCH /submissions/:submissionId/grading`

- Path: `submissionId: UUID`.
- Query: none.
- JSON body: `UpdateGradingDraftBody`.
- Response `200`: `DataResponse<GradingDraft>`.
- Errors: `400`, `401`, `404`, `409`, including `SCORE_EXCEEDS_MAXIMUM`.

This mutation is allowed when the current completed submission has `gradingState: "not_graded"` and `reviewState` equal to `needs_review` or `ready_to_grade`; other lifecycles return `409 INVALID_STATE`. At least one mutable field is required. A stale `expectedDocumentRevision` returns `409 REVISION_CONFLICT`. On success, only the supplied score and/or comments and the grading draft's update timestamp change. Question judgments are retained; `reviewState` and `gradingState` do not change, `gradedAt` remains null, and no content, page, or document revision is incremented.

### 2.3 Preview awarded question-points total

`GET /submissions/:submissionId/question-points-total`

- Path: `submissionId: UUID`.
- Query: `QuestionPointsTotalQuery`.
- Body: none.
- Response `200`: `DataResponse<QuestionPointsTotal>`.
- Errors: `401`, `404`, `409`.

This revision-checked read returns the sum over the submission's current question segments. A stale `expectedDocumentRevision` returns `409 REVISION_CONFLICT`; the result's `documentRevision` echoes the accepted revision. Retained judgments remain visible after a return to needs review. The route never changes the score or any review, grading, or revision field.

### 2.4 Apply confirmed question-points total to score

`POST /submissions/:submissionId/apply-question-points-to-score`

- Path: `submissionId: UUID`.
- Query: none.
- JSON body: `ApplyQuestionPointsBody`.
- Response `200`: `DataResponse<GradingDraft>`.
- Errors: `400`, `401`, `404`, `409`.

This mutation is allowed when the current completed submission has `gradingState: "not_graded"` and `reviewState` equal to `needs_review` or `ready_to_grade`; other lifecycles return `409 INVALID_STATE`. A stale `expectedDocumentRevision` returns `409 REVISION_CONFLICT`. The server recomputes the current question-points total in the same transaction. A value different from `expectedTotal` returns `409 REVISION_CONFLICT` with the current sum in `context.currentQuestionPointsTotal`; a total above the assignment maximum returns `409 SCORE_EXCEEDS_MAXIMUM`. Nothing is applied unless `confirmed` is `true`.

On success, the recomputed total becomes the submission score. Comments and question judgments are retained; `reviewState` and `gradingState` do not change, `gradedAt` remains null, and no content, page, or document revision is incremented.

### 2.5 Mark a submission graded

`POST /submissions/:submissionId/mark-graded`

- Path: `submissionId: UUID`.
- Query: none.
- JSON body: `DocumentRevisionCommandBody`.
- Response `200`: `DataResponse<GradingDraft>`.
- Errors: `400`, `401`, `404`, `409`.

The submission must be the current nonempty document, have `reviewState: "ready_to_grade"`, and have `gradingState: "not_graded"`; score and comments remain optional. Already-graded, needs-review, partial, failed, or unconfirmed submissions return `409 INVALID_STATE`. A stale `expectedDocumentRevision` returns `409 REVISION_CONFLICT`.

On success, `gradingState` becomes `graded` and `gradedAt` receives the server timestamp. `reviewState` remains `ready_to_grade`; score, comments, question judgments, and all page reviews are retained; and no content, page, or document revision is incremented.

## 3. Account deletion route change

### 3.1 Delete the authenticated account and Assignment Reader data

`DELETE /user/account`

- Path/query/body: none.
- Response `202` for the first and only teacher-authenticated acceptance: `DataResponse<DeletionOperation>` with `targetType: "account"`.
- Errors: `401`, `409`, `500`.

The command is allowed for an active authenticated account even when some owned resources have archived ancestry; deletion is the explicit exception to the archived-ancestry mutation prohibition. On acceptance, it creates the pending operation, immediately disables account access and revokes all sessions, attempts subscription cancellation, enumerates all relational and R2 data, and schedules cleanup.

Unlike ordinary resource deletions, this teacher API is intentionally not replayable after acceptance: the revoked session makes a repeated request return `401`, not the ordinary pending-operation `200` replay. There is no teacher-authenticated deletion-operation polling route. Internal cleanup deliveries remain replay-safe and operator/DLQ recovery may resume the same operation without exposing a second teacher response.
