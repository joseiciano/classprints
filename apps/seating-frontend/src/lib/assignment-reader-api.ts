import type {
  ApplyQuestionPointsBody,
  AssignmentListItem,
  AssignmentListQuery,
  AssignmentRecord,
  ClassListQuery,
  ClassRecord,
  ConfirmDocumentBody,
  ConfirmDocumentResult,
  CreateAssignmentBody,
  CreateClassBody,
  CreateStudentBody,
  CreateSubmissionBody,
  CreateSubmissionResult,
  DataResponse,
  DeletionOperation,
  DocumentAggregate,
  DocumentProcessingResponse,
  DocumentRevisionCommandBody,
  DocumentStateResult,
  DocumentType,
  DocumentWorkspace,
  GradingDraft,
  ListResponse,
  MaterialVersionSummary,
  PageImageQuery,
  PageSummary,
  PageWorkspace,
  ProcessingListQuery,
  QuestionJudgment,
  QuestionPointsTotal,
  QuestionPointsTotalQuery,
  ReplacePageResult,
  RetranscribeDocumentBody,
  RetryPageResult,
  ReviewContextResult,
  ReviewPageBody,
  ReviewPageResult,
  SavedSeatingChart,
  SeatingChartListQuery,
  StudentListQuery,
  StudentRecord,
  SubmissionListItem,
  SubmissionListQuery,
  SubmissionRecord,
  UpdateAssignmentBody,
  UpdateClassBody,
  UpdateGradingDraftBody,
  UpdatePageDraftBody,
  UpdateQuestionJudgmentBody,
  UpdateStudentBody,
} from '@classprints/assignment-reader-shared';
import { resolveWorkerBaseUrl } from '@classprints/shared';
import { request } from './http';

export type {
  AssignmentListItem,
  AssignmentRecord,
  ClassRecord,
  DeletionOperation,
  DocumentAggregate,
  DocumentType,
  DocumentWorkspace,
  GradingDraft,
  MaterialVersionSummary,
  PageSummary,
  PageWorkspace,
  QuestionJudgment,
  SavedSeatingChart,
  StudentRecord,
  SubmissionListItem,
  SubmissionRecord,
} from '@classprints/assignment-reader-shared';

/**
 * Serializes a `CanonicalListQuery` (never `pageSize`, per the API contract)
 * into a query string, omitting empty/undefined values.
 */
function canonicalListParams(query: object | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}) as [string, unknown][]) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

// ——— Classes ——————————————————————————————————————————————————————————————

export const fetchClasses = (query: ClassListQuery): Promise<ListResponse<ClassRecord>> =>
  request<ListResponse<ClassRecord>>(`/classes${canonicalListParams(query)}`);

export const fetchClass = async (classId: string): Promise<ClassRecord> => {
  const response = await request<DataResponse<ClassRecord>>(`/classes/${classId}`);
  return response.data;
};

export const createClass = async (body: CreateClassBody): Promise<ClassRecord> => {
  const response = await request<DataResponse<ClassRecord>>('/classes', {
    method: 'POST',
    body,
  });
  return response.data;
};

export const updateClass = async (
  classId: string,
  body: UpdateClassBody,
): Promise<ClassRecord> => {
  const response = await request<DataResponse<ClassRecord>>(`/classes/${classId}`, {
    method: 'PATCH',
    body,
  });
  return response.data;
};

export const deleteClass = async (classId: string): Promise<DeletionOperation> => {
  const response = await request<DataResponse<DeletionOperation>>(`/classes/${classId}`, {
    method: 'DELETE',
  });
  return response.data;
};

/**
 * Lists the teacher's active classes for the "Save to class" selector
 * (TASK-009). Only the canonical-list parameters the `/classes` route
 * accepts are sent; results are name-sorted so the selector reads
 * alphabetically.
 */
export const fetchActiveClasses = async (q?: string): Promise<ListResponse<ClassRecord>> => {
  const params = new URLSearchParams({ status: 'active', sort: 'name', direction: 'asc' });
  if (q && q.trim().length > 0) {
    params.set('q', q.trim());
  }
  return request<ListResponse<ClassRecord>>(`/classes?${params.toString()}`);
};

/**
 * Copies the selected seating result into a class-scoped snapshot
 * (TASK-009). Idempotent per (classId, source job): saving again for the
 * same class/job returns the original snapshot instead of a new one.
 */
export const saveSeatingChartToClass = async (
  externalId: string,
  payload: { classId: string; resultId: number },
): Promise<SavedSeatingChart> => {
  const response = await request<{ data: SavedSeatingChart }>(
    `/seating/${externalId}/save-to-class`,
    { method: 'POST', body: payload },
  );
  return response.data;
};

// ——— Roster students ———————————————————————————————————————————————————————

export const fetchStudents = (
  classId: string,
  query: StudentListQuery,
): Promise<ListResponse<StudentRecord>> =>
  request<ListResponse<StudentRecord>>(`/classes/${classId}/students${canonicalListParams(query)}`);

export const createStudent = async (
  classId: string,
  body: CreateStudentBody,
): Promise<StudentRecord> => {
  const response = await request<DataResponse<StudentRecord>>(`/classes/${classId}/students`, {
    method: 'POST',
    body,
  });
  return response.data;
};

export const updateStudent = async (
  classId: string,
  studentId: string,
  body: UpdateStudentBody,
): Promise<StudentRecord> => {
  const response = await request<DataResponse<StudentRecord>>(
    `/classes/${classId}/students/${studentId}`,
    { method: 'PATCH', body },
  );
  return response.data;
};

/** Non-destructive roster removal; the student record remains for history. */
export const removeStudentFromRoster = async (
  classId: string,
  studentId: string,
): Promise<StudentRecord> => {
  const response = await request<DataResponse<StudentRecord>>(
    `/classes/${classId}/students/${studentId}`,
    { method: 'DELETE' },
  );
  return response.data;
};

/** Destructive: deletes the roster record and every submission/page it owns. */
export const deleteStudentData = async (
  classId: string,
  studentId: string,
): Promise<DeletionOperation> => {
  const response = await request<DataResponse<DeletionOperation>>(
    `/classes/${classId}/students/${studentId}/data`,
    { method: 'DELETE' },
  );
  return response.data;
};

// ——— Assignments ———————————————————————————————————————————————————————————

export const fetchAssignments = (
  classId: string,
  query: AssignmentListQuery,
): Promise<ListResponse<AssignmentListItem>> =>
  request<ListResponse<AssignmentListItem>>(
    `/classes/${classId}/assignments${canonicalListParams(query)}`,
  );

export const createAssignment = async (
  classId: string,
  body: CreateAssignmentBody,
): Promise<AssignmentRecord> => {
  const response = await request<DataResponse<AssignmentRecord>>(
    `/classes/${classId}/assignments`,
    { method: 'POST', body },
  );
  return response.data;
};

export const fetchAssignment = async (assignmentId: string): Promise<AssignmentRecord> => {
  const response = await request<DataResponse<AssignmentRecord>>(`/assignments/${assignmentId}`);
  return response.data;
};

export const updateAssignment = async (
  assignmentId: string,
  body: UpdateAssignmentBody,
): Promise<AssignmentRecord> => {
  const response = await request<DataResponse<AssignmentRecord>>(`/assignments/${assignmentId}`, {
    method: 'PATCH',
    body,
  });
  return response.data;
};

export const deleteAssignment = async (assignmentId: string): Promise<DeletionOperation> => {
  const response = await request<DataResponse<DeletionOperation>>(`/assignments/${assignmentId}`, {
    method: 'DELETE',
  });
  return response.data;
};

// ——— Saved seating charts ————————————————————————————————————————————————

export const fetchSeatingCharts = (
  classId: string,
  query: SeatingChartListQuery,
): Promise<ListResponse<SavedSeatingChart>> =>
  request<ListResponse<SavedSeatingChart>>(
    `/classes/${classId}/seating-charts${canonicalListParams(query)}`,
  );

export const fetchSavedSeatingChart = async (chartId: string): Promise<SavedSeatingChart> => {
  const response = await request<DataResponse<SavedSeatingChart>>(
    `/saved-seating-charts/${chartId}`,
  );
  return response.data;
};

// ——— Material versions ———————————————————————————————————————————————————

export const fetchMaterialVersions = (
  assignmentId: string,
  page?: number,
): Promise<ListResponse<MaterialVersionSummary>> =>
  request<ListResponse<MaterialVersionSummary>>(
    `/assignments/${assignmentId}/material-versions${canonicalListParams({ page })}`,
  );

export const createDraftMaterialVersion = async (
  assignmentId: string,
): Promise<MaterialVersionSummary> => {
  const response = await request<DataResponse<MaterialVersionSummary>>(
    `/assignments/${assignmentId}/material-versions`,
    { method: 'POST', body: {} },
  );
  return response.data;
};

export const fetchMaterialVersion = async (
  materialVersionId: string,
): Promise<MaterialVersionSummary> => {
  const response = await request<DataResponse<MaterialVersionSummary>>(
    `/material-versions/${materialVersionId}`,
  );
  return response.data;
};

export const deleteAssignmentMaterials = async (
  assignmentId: string,
): Promise<DeletionOperation> => {
  const response = await request<DataResponse<DeletionOperation>>(
    `/assignments/${assignmentId}/materials`,
    { method: 'DELETE' },
  );
  return response.data;
};

// ——— Submissions ——————————————————————————————————————————————————————————

export const fetchSubmissions = (
  assignmentId: string,
  query: SubmissionListQuery,
): Promise<ListResponse<SubmissionListItem>> =>
  request<ListResponse<SubmissionListItem>>(
    `/assignments/${assignmentId}/submissions${canonicalListParams(query)}`,
  );

export const createOrReturnSubmission = async (
  assignmentId: string,
  body: CreateSubmissionBody,
): Promise<CreateSubmissionResult> => {
  const response = await request<DataResponse<CreateSubmissionResult>>(
    `/assignments/${assignmentId}/submissions`,
    { method: 'POST', body },
  );
  return response.data;
};

export const fetchSubmission = async (submissionId: string): Promise<SubmissionRecord> => {
  const response = await request<DataResponse<SubmissionRecord>>(`/submissions/${submissionId}`);
  return response.data;
};

export const deleteSubmission = async (submissionId: string): Promise<DeletionOperation> => {
  const response = await request<DataResponse<DeletionOperation>>(
    `/submissions/${submissionId}`,
    { method: 'DELETE' },
  );
  return response.data;
};

// ——— Documents, pages, and upload ———————————————————————————————————————

export const fetchDocumentAggregate = async (
  documentType: DocumentType,
  documentId: string,
): Promise<DocumentAggregate> => {
  const response = await request<DataResponse<DocumentAggregate>>(
    `/documents/${documentType}/${documentId}`,
  );
  return response.data;
};

export const fetchDocumentProcessing = (
  documentType: DocumentType,
  documentId: string,
  query: ProcessingListQuery,
): Promise<DocumentProcessingResponse> =>
  request<DocumentProcessingResponse>(
    `/documents/${documentType}/${documentId}/processing${canonicalListParams(query)}`,
  );

/**
 * Fetches every current page of a document's processing list, newest pages
 * not excepted, and returns them ordered by `position`. The canonical list
 * contract fixes `pageSize` at 10 while a document may hold up to 20 pages,
 * so the upload flow (which needs the complete current set, not one page of
 * it) walks every page of this paginated response itself.
 */
export const fetchAllDocumentPages = async (
  documentType: DocumentType,
  documentId: string,
): Promise<PageSummary[]> => {
  const first = await fetchDocumentProcessing(documentType, documentId, {
    sort: 'uploadedAt',
    direction: 'asc',
    page: 1,
  });
  const pages = [...first.data];
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    const next = await fetchDocumentProcessing(documentType, documentId, {
      sort: 'uploadedAt',
      direction: 'asc',
      page,
    });
    pages.push(...next.data);
  }
  return pages.sort((a, b) => a.position - b.position);
};

const uploadDocumentPageEndpoint = (documentType: DocumentType, documentId: string): string =>
  documentType === 'materials'
    ? `/material-versions/${documentId}/pages`
    : `/submissions/${documentId}/pages`;

export const uploadDocumentPage = async (
  documentType: DocumentType,
  documentId: string,
  file: File,
): Promise<PageSummary> => {
  const formData = new FormData();
  formData.set('file', file);
  const response = await request<DataResponse<PageSummary>>(
    uploadDocumentPageEndpoint(documentType, documentId),
    { method: 'POST', body: formData },
  );
  return response.data;
};

export const replacePageImage = async (
  pageId: string,
  file: File,
): Promise<ReplacePageResult> => {
  const formData = new FormData();
  formData.set('file', file);
  const response = await request<DataResponse<ReplacePageResult>>(`/pages/${pageId}/replace`, {
    method: 'POST',
    body: formData,
  });
  return response.data;
};

export const deletePage = async (pageId: string): Promise<DeletionOperation> => {
  const response = await request<DataResponse<DeletionOperation>>(`/pages/${pageId}`, {
    method: 'DELETE',
  });
  return response.data;
};

export const confirmDocument = async (
  documentType: DocumentType,
  documentId: string,
  body: ConfirmDocumentBody,
): Promise<ConfirmDocumentResult> => {
  const response = await request<DataResponse<ConfirmDocumentResult>>(
    `/documents/${documentType}/${documentId}/confirm`,
    { method: 'POST', body },
  );
  return response.data;
};

/**
 * Builds the authenticated image-delivery URL (TASK-012) for direct use as
 * an `<img src>`/background: the API is reached same-origin (session cookies
 * attach automatically, see `resolveWorkerBaseUrl`), so no separate blob
 * fetch is needed. Region crops always pass normalized `x`/`y`/`width`/
 * `height` alongside `variant: "region"`.
 */
export const pageImageUrl = (pageId: string, query?: PageImageQuery): string => {
  const params = new URLSearchParams();
  if (query?.variant) params.set('variant', query.variant);
  if (query?.rotation) params.set('rotation', String(query.rotation));
  if (query?.variant === 'region') {
    if (query.x !== undefined) params.set('x', String(query.x));
    if (query.y !== undefined) params.set('y', String(query.y));
    if (query.width !== undefined) params.set('width', String(query.width));
    if (query.height !== undefined) params.set('height', String(query.height));
  }
  const serialized = params.toString();
  return `${resolveWorkerBaseUrl()}/api/v1/pages/${pageId}/image${serialized ? `?${serialized}` : ''}`;
};

export const retryPage = async (pageId: string): Promise<RetryPageResult> => {
  const response = await request<DataResponse<RetryPageResult>>(`/pages/${pageId}/retry`, {
    method: 'POST',
  });
  return response.data;
};

export const retranscribeDocument = async (
  documentType: DocumentType,
  documentId: string,
  body: RetranscribeDocumentBody,
): Promise<ConfirmDocumentResult> => {
  const response = await request<DataResponse<ConfirmDocumentResult>>(
    `/documents/${documentType}/${documentId}/retranscribe`,
    { method: 'POST', body },
  );
  return response.data;
};

// ——— Workspace, draft editing, review, and grading ————————————————————————

export const fetchDocumentWorkspace = async (
  documentType: DocumentType,
  documentId: string,
): Promise<DocumentWorkspace> => {
  const response = await request<DataResponse<DocumentWorkspace>>(
    `/documents/${documentType}/${documentId}/workspace`,
  );
  return response.data;
};

export const captureReviewContext = async (submissionId: string): Promise<ReviewContextResult> => {
  const response = await request<DataResponse<ReviewContextResult>>(
    `/submissions/${submissionId}/review-context`,
    { method: 'POST', body: {} },
  );
  return response.data;
};

export const fetchPageWorkspace = async (pageId: string): Promise<PageWorkspace> => {
  const response = await request<DataResponse<PageWorkspace>>(`/pages/${pageId}`);
  return response.data;
};

export const updatePageDraft = async (
  pageId: string,
  body: UpdatePageDraftBody,
): Promise<PageWorkspace> => {
  const response = await request<DataResponse<PageWorkspace>>(`/pages/${pageId}/draft`, {
    method: 'PATCH',
    body,
  });
  return response.data;
};

export const reviewPage = async (
  pageId: string,
  body: ReviewPageBody,
): Promise<ReviewPageResult> => {
  const response = await request<DataResponse<ReviewPageResult>>(`/pages/${pageId}/review`, {
    method: 'POST',
    body,
  });
  return response.data;
};

export const markDocumentReady = async (
  documentType: DocumentType,
  documentId: string,
  body: DocumentRevisionCommandBody,
): Promise<DocumentStateResult> => {
  const response = await request<DataResponse<DocumentStateResult>>(
    `/documents/${documentType}/${documentId}/mark-ready`,
    { method: 'POST', body },
  );
  return response.data;
};

export const returnToNeedsReview = async (
  documentType: DocumentType,
  documentId: string,
  body: DocumentRevisionCommandBody,
): Promise<DocumentStateResult> => {
  const response = await request<DataResponse<DocumentStateResult>>(
    `/documents/${documentType}/${documentId}/return-to-needs-review`,
    { method: 'POST', body },
  );
  return response.data;
};

export const updateQuestionJudgment = async (
  pageId: string,
  segmentId: string,
  body: UpdateQuestionJudgmentBody,
): Promise<QuestionJudgment> => {
  const response = await request<DataResponse<QuestionJudgment>>(
    `/pages/${pageId}/question-segments/${segmentId}/judgment`,
    { method: 'PUT', body },
  );
  return response.data;
};

export const updateGradingDraft = async (
  submissionId: string,
  body: UpdateGradingDraftBody,
): Promise<GradingDraft> => {
  const response = await request<DataResponse<GradingDraft>>(`/submissions/${submissionId}/grading`, {
    method: 'PATCH',
    body,
  });
  return response.data;
};

export const getQuestionPointsTotal = async (
  submissionId: string,
  query: QuestionPointsTotalQuery,
): Promise<QuestionPointsTotal> =>
  request<DataResponse<QuestionPointsTotal>>(
    `/submissions/${submissionId}/question-points-total?expectedDocumentRevision=${query.expectedDocumentRevision}`,
  ).then((response) => response.data);

export const applyQuestionPointsToScore = async (
  submissionId: string,
  body: ApplyQuestionPointsBody,
): Promise<GradingDraft> => {
  const response = await request<DataResponse<GradingDraft>>(
    `/submissions/${submissionId}/apply-question-points-to-score`,
    { method: 'POST', body },
  );
  return response.data;
};

export const markSubmissionGraded = async (
  submissionId: string,
  body: DocumentRevisionCommandBody,
): Promise<GradingDraft> => {
  const response = await request<DataResponse<GradingDraft>>(
    `/submissions/${submissionId}/mark-graded`,
    { method: 'POST', body },
  );
  return response.data;
};
