# Assignment Reader API Manifest

**Status:** Planned  
**Base path:** `/api/v1`  
**Audience:** Assignment Reader API, frontend, worker, and test implementers

This document is the entry point of the normative HTTP contract for the Assignment Reader MVP. The product requirements define behavior, the implementation plan defines sequencing, and this manifest family fixes route names, accepted inputs, response fields, and wire types. Implementations must not add aliases, compatibility shims, or independently reshape these payloads.

The contract is split by concern. Every file is normative; the conventions in §1 apply to every companion file:

| File | Contents |
|---|---|
| `api-manifest.md` (this file) | Protocol conventions, route index, source traceability |
| [`api-types.md`](api-types.md) | The single canonical definition of every named protocol, request, query, result, response, hierarchy, document, review, seating, grading, and deletion wire type |
| [`api-routes-hierarchy.md`](api-routes-hierarchy.md) | Classes, roster students, assignments, seating results, and saved seating charts |
| [`api-routes-documents.md`](api-routes-documents.md) | Material versions, submissions, page upload/order/replacement, image delivery, processing, retry, retranscription |
| [`api-routes-review.md`](api-routes-review.md) | Workspace, draft editing, page review, document readiness, question judgments, grading, account deletion |

## 1. Protocol conventions

### 1.1 Authentication, ownership, lifecycle, and deletion visibility

- Every route in this contract requires a valid Better Auth teacher session. The browser sends the session cookie with `credentials: "include"`.
- Every state-changing request must include the repository's CSRF header and token.
- The authenticated teacher ID is derived from the session. It is never accepted in a path, query, form, or JSON body.
- Missing or invalid authentication returns `401`.
- A missing resource and a resource owned by another teacher both return `404 RESOURCE_NOT_FOUND`; the API never confirms another teacher's resource exists.
- Archived class ancestry is readable. Destructive delete commands remain allowed beneath archived ancestry; every other mutation returns `409 ARCHIVED_ANCESTRY`.
- Historical material summary, document aggregate, workspace, page, and image reads remain available and read-only. Historical mutation actions are absent from workspace responses, and mutation attempts return `409 HISTORICAL_VERSION_READ_ONLY`.
- A resource with a pending deletion operation is omitted from lists and returns `404 RESOURCE_NOT_FOUND` from every route except replay of the same ordinary delete command. The matching delete replay returns the pending operation with `200`; after cleanup completes, the target and another delete both return `404`.
- Ordinary delete commands check for an owned pending operation before normal target lookup. The first accepted command returns `202`. These replay rules apply to page, materials, submission, student-data, assignment, and class deletion, including under archived ancestry.
- Account deletion is not teacher-replayable: its first accepted request returns `202` and revokes the session. Only internal cleanup/operator recovery is replay-safe after that point.

### 1.2 Serialization and named types

Every named wire type is defined exactly once in [`api-types.md`](api-types.md). That file owns the scalar aliases, state unions, success and error envelopes, validation context, canonical list query, and all route-specific body/query/result/response types referenced below or by a route file.

Database millisecond timestamps and `numeric(..., 2)` values are converted to the documented wire types at the controller boundary. JSON responses use camelCase. UUID strings use lowercase canonical RFC 4122 form; timestamps use UTC RFC 3339/ISO 8601 form. Unknown request fields are rejected.

### 1.3 Success envelopes

JSON success responses use `DataResponse<T>`, `ListResponse<T>`, or another named response type that canonically composes one of those envelopes. `Pagination.pageSize` is fixed at 10 for paginated lists and `totalPages` is zero when `totalItems` is zero.

`GET /seating/:externalId/results` is the second exception after the binary page-image response: it preserves the existing seating backend's legacy direct-JSON `SeatingResultsResponse`, whose `jobId`/`status`/`statusMetadata`/`results`/`error` fields sit at the top level without a `data` wrapper.

### 1.4 Error envelope

JSON errors use `ApiErrorResponse`. Common statuses are `400` malformed/invalid input, `401` unauthenticated, `404` absent, non-owned, or deletion-pending resource, `409` lifecycle/revision/archival conflict, `413` image larger than 10 MB, `415` unsupported or malformed image, and `500` internal or committed queue-delivery failure. Route contracts list additional expected statuses.

Revision conflicts identify the current revision in the applicable `ErrorContext` field: `currentDocumentRevision`, `currentPageRevision`, or `currentContentRevision`. The three scopes are never collapsed into a single revision field.

### 1.5 Canonical lists and explicit ordering exceptions

Every canonical list accepts `CanonicalListQuery<Sort, Status>` as specialized by its route. `pageSize` is never accepted. Unless an exception below says otherwise, the requested sort is followed by stable `id asc`.

The exceptions are normative:

- `GET /assignments/:assignmentId/material-versions` is deliberately not a canonical list. It accepts only `page`, orders by `version desc` then `id asc`, and exposes the canonical-list material-version-history exception rather than pretending version history supports search/filter controls.
- `GET /assignments/:assignmentId/submissions` includes roster students without submissions. Its status filter values are exactly the row's granular `displayStatus` values: `not_started`, `uploading`, `queued`, `transcribing`, `error`, `needs_review`, `ready_to_grade`, and `graded`; there is no aggregate `processing` filter.
- For that submission list, `sort=status&direction=asc` uses the rank shown above, and `direction=desc` reverses that rank. Its stable tiebreak is always `studentId asc`, not nullable `submissionId`.
- For submission-list `sort=createdAt`, not-started rows have `createdAt: null`; nulls sort last in both directions, followed by the same `studentId asc` tiebreak.

A not-started submission row is a roster projection, not a document resource. Opening it starts the create-submission/upload flow.

## 2. Route index

The table contains all **51** formal routes in contract order. Detailed path/query/body/response rules live in the route files; every referenced named type is defined in `api-types.md`.

| Method | Path | Success type |
|---|---|---|
| `GET` | `/classes` | `ListResponse<ClassRecord>` |
| `POST` | `/classes` | `DataResponse<ClassRecord>` |
| `GET` | `/classes/:classId` | `DataResponse<ClassRecord>` |
| `PATCH` | `/classes/:classId` | `DataResponse<ClassRecord>` |
| `DELETE` | `/classes/:classId` | `DataResponse<DeletionOperation>` |
| `GET` | `/classes/:classId/students` | `ListResponse<StudentRecord>` |
| `POST` | `/classes/:classId/students` | `DataResponse<StudentRecord>` |
| `PATCH` | `/classes/:classId/students/:studentId` | `DataResponse<StudentRecord>` |
| `DELETE` | `/classes/:classId/students/:studentId` | `DataResponse<StudentRecord>` |
| `DELETE` | `/classes/:classId/students/:studentId/data` | `DataResponse<DeletionOperation>` |
| `GET` | `/classes/:classId/assignments` | `ListResponse<AssignmentListItem>` |
| `POST` | `/classes/:classId/assignments` | `DataResponse<AssignmentRecord>` |
| `GET` | `/assignments/:assignmentId` | `DataResponse<AssignmentRecord>` |
| `PATCH` | `/assignments/:assignmentId` | `DataResponse<AssignmentRecord>` |
| `DELETE` | `/assignments/:assignmentId` | `DataResponse<DeletionOperation>` |
| `GET` | `/classes/:classId/seating-charts` | `ListResponse<SavedSeatingChart>` |
| `GET` | `/saved-seating-charts/:chartId` | `DataResponse<SavedSeatingChart>` |
| `GET` | `/seating/:externalId/results` | `SeatingResultsResponse` |
| `POST` | `/seating/:externalId/save-to-class` | `DataResponse<SavedSeatingChart>` |
| `GET` | `/assignments/:assignmentId/material-versions` | `ListResponse<MaterialVersionSummary>` |
| `POST` | `/assignments/:assignmentId/material-versions` | `DataResponse<MaterialVersionSummary>` |
| `GET` | `/material-versions/:materialVersionId` | `DataResponse<MaterialVersionSummary>` |
| `DELETE` | `/assignments/:assignmentId/materials` | `DataResponse<DeletionOperation>` |
| `GET` | `/assignments/:assignmentId/submissions` | `ListResponse<SubmissionListItem>` |
| `POST` | `/assignments/:assignmentId/submissions` | `DataResponse<CreateSubmissionResult>` |
| `GET` | `/submissions/:submissionId` | `DataResponse<SubmissionRecord>` |
| `POST` | `/submissions/:submissionId/review-context` | `DataResponse<ReviewContextResult>` |
| `DELETE` | `/submissions/:submissionId` | `DataResponse<DeletionOperation>` |
| `POST` | `/material-versions/:materialVersionId/pages` | `DataResponse<PageSummary>` |
| `POST` | `/submissions/:submissionId/pages` | `DataResponse<PageSummary>` |
| `POST` | `/pages/:pageId/replace` | `DataResponse<ReplacePageResult>` |
| `DELETE` | `/pages/:pageId` | `DataResponse<DeletionOperation>` |
| `POST` | `/documents/:documentType/:documentId/confirm` | `DataResponse<ConfirmDocumentResult>` |
| `POST` | `/documents/:documentType/:documentId/retry-confirm` | `DataResponse<ConfirmDocumentResult>` |
| `GET` | `/pages/:pageId/image` | `image/jpeg` |
| `GET` | `/documents/:documentType/:documentId/processing` | `DocumentProcessingResponse` |
| `GET` | `/documents/:documentType/:documentId` | `DataResponse<DocumentAggregate>` |
| `POST` | `/pages/:pageId/retry` | `DataResponse<RetryPageResult>` |
| `POST` | `/documents/:documentType/:documentId/retranscribe` | `DataResponse<ConfirmDocumentResult>` |
| `GET` | `/documents/:documentType/:documentId/workspace` | `DataResponse<DocumentWorkspace>` |
| `GET` | `/pages/:pageId` | `DataResponse<PageWorkspace>` |
| `PATCH` | `/pages/:pageId/draft` | `DataResponse<PageWorkspace>` |
| `POST` | `/pages/:pageId/review` | `DataResponse<ReviewPageResult>` |
| `POST` | `/documents/:documentType/:documentId/mark-ready` | `DataResponse<DocumentStateResult>` |
| `POST` | `/documents/:documentType/:documentId/return-to-needs-review` | `DataResponse<DocumentStateResult>` |
| `PUT` | `/pages/:pageId/question-segments/:segmentId/judgment` | `DataResponse<QuestionJudgment>` |
| `PATCH` | `/submissions/:submissionId/grading` | `DataResponse<GradingDraft>` |
| `GET` | `/submissions/:submissionId/question-points-total` | `DataResponse<QuestionPointsTotal>` |
| `POST` | `/submissions/:submissionId/apply-question-points-to-score` | `DataResponse<GradingDraft>` |
| `POST` | `/submissions/:submissionId/mark-graded` | `DataResponse<GradingDraft>` |
| `DELETE` | `/user/account` | `DataResponse<DeletionOperation>` |

## 3. Source traceability

- Hierarchy, canonical lists, seating-result selection, and seating persistence: implementation plan TASK-007 through TASK-009; routes in `api-routes-hierarchy.md`.
- Upload, order, replacement, image delivery: TASK-010 through TASK-012; routes in `api-routes-documents.md`.
- Processing, retry, and retranscription: TASK-013 through TASK-015; routes in `api-routes-documents.md`.
- Editing, review, grading, and deletion: TASK-016 through TASK-018; routes in `api-routes-review.md`.
- Typed frontend consumers: TASK-019 through TASK-026.
- Shared Zod contract encoding: TASK-001 through TASK-002 and PAT-001; all named wire types in `api-types.md`.
- Migration, storage, queue, and worker foundations: TASK-004 through TASK-006.
- Seating-result identity: plan REQ-023 and the existing `seating_results.id` bigserial; `GET /seating/:externalId/results` exposes `resultId: number`, and `SavedSeatingChart.sourceResultId` remains a number.
- Page identity and R2 keys: plan REQ-020 and functional spec §2; all image delivery flows through `api-routes-documents.md` §2.7 and never a public object URL.
- Product behavior and lifecycle: `product-doc.md` capabilities 1–7 and resolved decisions 1–12.
- Storage, queues, images, and polling constraints: `functional-spec.md` §§1–10.
