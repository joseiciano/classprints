# Assignment Reader API — Hierarchy and Seating Routes

**Status:** Planned  
**Base path:** `/api/v1`  
**Audience:** Assignment Reader API, frontend, and test implementers

Route contracts for classes, roster students, assignments, and saved seating charts. Authentication, envelopes, errors, and the canonical list query are defined in [`api-manifest.md`](api-manifest.md) §1; every referenced type is defined in [`api-types.md`](api-types.md). Status codes not listed per route follow manifest §1.4.

### Hierarchy mutation and deletion rules

Every request is teacher-authenticated and ownership-scoped. A missing or non-owned resource returns `404 RESOURCE_NOT_FOUND`; the API does not reveal another teacher's resource.

Except for destructive deletion, every mutation beneath an archived class returns `409 ARCHIVED_ANCESTRY`. The destructive class, student-data, and assignment deletion routes remain available when their target or an ancestor is archived; the roster-removal route is non-destructive and does not receive this exception.

For each destructive deletion route, resolve a teacher-scoped pending `DeletionOperation` for the target before looking up the live target. The first accepted deletion returns `202`; a replay while that operation remains pending returns the same operation with `200`. All other routes treat a pending-deletion target as absent and return `404`. Once deletion completes, the target and any later deletion request both return `404`.

## 1. Class and roster routes

### 1.1 List classes

`GET /classes`

- Path params: none.
- Query: `CanonicalListQuery<"createdAt" | "name" | "studentCount" | "assignmentCount" | "status", ClassStatus>`.
- Defaults: `sort=createdAt`, `direction=desc`, `page=1`.
- Body: none.
- Response `200`: `ListResponse<ClassRecord>`.
- Errors: `400`, `401`.

### 1.2 Create a class

`POST /classes`

- Path/query params: none.
- JSON body: `CreateClassBody`.

- Response `201`: `DataResponse<ClassRecord>`.
- Errors: `400`, `401`.

### 1.3 Get a class

`GET /classes/:classId`

- Path: `classId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<ClassRecord>`.
- Errors: `401`, `404`.

### 1.4 Update or archive a class

`PATCH /classes/:classId`

- Path: `classId: UUID`.
- Query: none.
- JSON body: `UpdateClassBody`.

At least one field is required.

- Response `200`: `DataResponse<ClassRecord>`.
- Errors: `400`, `401`, `404`, `409`.

### 1.5 Delete a class and all descendants

`DELETE /classes/:classId`

- Path: `classId: UUID`.
- Query/body: none.
- Response `202` first request or `200` replay: `DataResponse<DeletionOperation>`.
- Errors: `401`, `404`, `409`.

### 1.6 List roster students

`GET /classes/:classId/students`

- Path: `classId: UUID`.
- Query: `CanonicalListQuery<"createdAt" | "name" | "status", StudentStatus>`.
- Defaults: `sort=name`, `direction=asc`, `page=1`, `status=active`.
- Body: none.
- Response `200`: `ListResponse<StudentRecord>`.
- Errors: `400`, `401`, `404`.

### 1.7 Add a roster student

`POST /classes/:classId/students`

- Path: `classId: UUID`.
- Query: none.
- JSON body: `CreateStudentBody`.

- Response `201`: `DataResponse<StudentRecord>`.
- Errors: `400`, `401`, `404`, `409`.

### 1.8 Rename a roster student

`PATCH /classes/:classId/students/:studentId`

- Path: `classId: UUID`, `studentId: UUID`.
- Query: none.
- JSON body: `UpdateStudentBody`.

- Response `200`: `DataResponse<StudentRecord>`.
- Errors: `400`, `401`, `404`, `409`.

### 1.9 Remove a student from the active roster

`DELETE /classes/:classId/students/:studentId`

This is a non-destructive roster removal, not student-data deletion. Historical submissions remain attached to the assignment; restoring removed students is outside this release.

- Path: `classId: UUID`, `studentId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<StudentRecord>` with `status: "removed"`.
- Errors: `401`, `404`, `409`.

### 1.10 Delete a student's data

`DELETE /classes/:classId/students/:studentId/data`

This deletes the roster record, all of its submissions, and every current/historical page object through the deletion pipeline.

- Path: `classId: UUID`, `studentId: UUID`.
- Query/body: none.
- Response `202` first request or `200` replay: `DataResponse<DeletionOperation>`.
- Errors: `401`, `404`, `409`.

## 2. Assignment and seating-chart routes

### 2.1 List assignments in a class

`GET /classes/:classId/assignments`

- Path: `classId: UUID`.
- Query: `CanonicalListQuery<"createdAt" | "name" | "status", AssignmentStatus>`.
- Defaults: `sort=createdAt`, `direction=desc`, `page=1`.
- Body: none.
- Response `200`: `ListResponse<AssignmentListItem>`.
- Errors: `400`, `401`, `404`.

### 2.2 Create an assignment

`POST /classes/:classId/assignments`

- Path: `classId: UUID`.
- Query: none.
- JSON body: `CreateAssignmentBody`.

- Response `201`: `DataResponse<AssignmentRecord>`.
- Errors: `400`, `401`, `404`, `409`.

### 2.3 Get assignment detail

`GET /assignments/:assignmentId`

- Path: `assignmentId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<AssignmentRecord>`.
- Errors: `401`, `404`.

### 2.4 Update assignment metadata

`PATCH /assignments/:assignmentId`

- Path: `assignmentId: UUID`.
- Query: none.
- JSON body: `UpdateAssignmentBody`.

At least one field is required. Lowering `maxScore` below any saved submission score returns `409 SCORE_EXCEEDS_MAXIMUM`; the API never silently changes scores.

- Response `200`: `DataResponse<AssignmentRecord>`.
- Errors: `400`, `401`, `404`, `409`.

### 2.5 Delete an assignment

`DELETE /assignments/:assignmentId`

- Path: `assignmentId: UUID`.
- Query/body: none.
- Response `202` first request or `200` replay: `DataResponse<DeletionOperation>`.
- Errors: `401`, `404`, `409`.

### 2.6 List saved seating charts in a class

`GET /classes/:classId/seating-charts`

- Path: `classId: UUID`.
- Query: `CanonicalListQuery<"createdAt" | "className" | "studentCount">`.
- Defaults: `sort=createdAt`, `direction=desc`, `page=1`.
- Body: none.
- Response `200`: `ListResponse<SavedSeatingChart>`.
- Errors: `400`, `401`, `404`.

### 2.7 Get a saved seating chart

`GET /saved-seating-charts/:chartId`

- Path: `chartId: UUID`.
- Query/body: none.
- Response `200`: `DataResponse<SavedSeatingChart>`.
- Errors: `401`, `404`.

### 2.8 Get generated seating results

`GET /seating/:externalId/results`

- Authentication: a teacher session is required.
- Path: `externalId: string` (the existing opaque seating-job external ID).
- Query/body: none.
- Ownership: the seating job must belong to the authenticated teacher. An absent or non-owned job returns `404 RESOURCE_NOT_FOUND` rather than revealing whether it exists.
- Response `200`: `SeatingResultsResponse`. Every `SeatingResultItem` includes its immutable numeric `resultId`, which identifies the result accepted by the save route.
- Errors: `401`, `404`.

### 2.9 Save a seating result to a class

`POST /seating/:externalId/save-to-class`

- Authentication: a teacher session is required.
- Path: `externalId: string` (the existing opaque seating-job external ID).
- Query: none.
- JSON body: `SaveSeatingChartBody`, whose canonical `resultId` is a `number`.
- Ownership: the seating job, selected numeric result, and destination class must belong to the authenticated teacher. An absent or non-owned resource returns `404 RESOURCE_NOT_FOUND`.

Saving is idempotent for `(classId, externalId)`; attempting to save a second result from the same job to the same class returns the originally saved snapshot. The returned `SavedSeatingChart.sourceResultId` is the same numeric identity as the selected `SaveSeatingChartBody.resultId`.

- Response `201` first save or `200` replay: `DataResponse<SavedSeatingChart>`.
- Errors: `400`, `401`, `404`, `409`.
