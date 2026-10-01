import type {
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
  DocumentType,
  ListResponse,
  MaterialVersionSummary,
  PageSummary,
  ProcessingListQuery,
  ReplacePageResult,
  SavedSeatingChart,
  SeatingChartListQuery,
  StudentListQuery,
  StudentRecord,
  SubmissionListItem,
  SubmissionListQuery,
  SubmissionRecord,
  UpdateAssignmentBody,
  UpdateClassBody,
  UpdateStudentBody,
} from '@classprints/assignment-reader-shared';
import { request } from './http';

export type {
  AssignmentListItem,
  AssignmentRecord,
  ClassRecord,
  DeletionOperation,
  DocumentAggregate,
  DocumentType,
  MaterialVersionSummary,
  PageSummary,
  SavedSeatingChart,
  StudentRecord,
  SubmissionListItem,
  SubmissionRecord,
} from '@classprints/assignment-reader-shared';

/**
 * Serializes a `CanonicalListQuery` (never `pageSize`, per the API contract)
 * into a query string, omitting empty/undefined values.
 */
function canonicalListParams(query: Record<string, unknown> | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
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
