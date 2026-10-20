import type {
  AssignmentListQuery,
  ClassListQuery,
  DocumentType,
  ProcessingListQuery,
  SeatingChartListQuery,
  StudentListQuery,
  SubmissionListQuery,
} from '@classprints/assignment-reader-shared';

/**
 * Hierarchical tuple query-key factories for every Assignment Reader read
 * (TASK-019 / GUD-003). Every list key includes its full `CanonicalListQuery`
 * so distinct search/sort/page combinations cache independently, and every
 * detail key nests under its parent so a targeted `invalidateQueries` call
 * only touches the affected class/assignment/document branch.
 */
export const assignmentReaderKeys = {
  all: ['assignment-reader'] as const,

  classes: {
    all: () => [...assignmentReaderKeys.all, 'classes'] as const,
    list: (query: ClassListQuery) =>
      [...assignmentReaderKeys.classes.all(), 'list', query] as const,
    detail: (classId: string) => [...assignmentReaderKeys.classes.all(), 'detail', classId] as const,
    students: {
      all: (classId: string) => [...assignmentReaderKeys.classes.detail(classId), 'students'] as const,
      list: (classId: string, query: StudentListQuery) =>
        [...assignmentReaderKeys.classes.students.all(classId), 'list', query] as const,
    },
    assignments: {
      all: (classId: string) =>
        [...assignmentReaderKeys.classes.detail(classId), 'assignments'] as const,
      list: (classId: string, query: AssignmentListQuery) =>
        [...assignmentReaderKeys.classes.assignments.all(classId), 'list', query] as const,
    },
    seatingCharts: {
      all: (classId: string) =>
        [...assignmentReaderKeys.classes.detail(classId), 'seating-charts'] as const,
      list: (classId: string, query: SeatingChartListQuery) =>
        [...assignmentReaderKeys.classes.seatingCharts.all(classId), 'list', query] as const,
    },
  },

  savedSeatingChart: {
    detail: (chartId: string) =>
      [...assignmentReaderKeys.all, 'saved-seating-charts', chartId] as const,
  },

  assignments: {
    detail: (assignmentId: string) =>
      [...assignmentReaderKeys.all, 'assignments', 'detail', assignmentId] as const,
    materialVersions: {
      all: (assignmentId: string) =>
        [...assignmentReaderKeys.assignments.detail(assignmentId), 'material-versions'] as const,
      list: (assignmentId: string, page: number | undefined) =>
        [...assignmentReaderKeys.assignments.materialVersions.all(assignmentId), 'list', page ?? 1] as const,
    },
    submissions: {
      all: (assignmentId: string) =>
        [...assignmentReaderKeys.assignments.detail(assignmentId), 'submissions'] as const,
      list: (assignmentId: string, query: SubmissionListQuery) =>
        [...assignmentReaderKeys.assignments.submissions.all(assignmentId), 'list', query] as const,
    },
  },

  materialVersion: {
    detail: (materialVersionId: string) =>
      [...assignmentReaderKeys.all, 'material-versions', materialVersionId] as const,
  },

  submission: {
    detail: (submissionId: string) => [...assignmentReaderKeys.all, 'submissions', submissionId] as const,
  },

  documents: {
    aggregate: (documentType: DocumentType, documentId: string) =>
      [...assignmentReaderKeys.all, 'documents', documentType, documentId] as const,
    processing: (documentType: DocumentType, documentId: string, query: ProcessingListQuery) =>
      [
        ...assignmentReaderKeys.documents.aggregate(documentType, documentId),
        'processing',
        query,
      ] as const,
    workspace: (documentType: DocumentType, documentId: string) =>
      [...assignmentReaderKeys.documents.aggregate(documentType, documentId), 'workspace'] as const,
  },

  pages: {
    detail: (pageId: string) => [...assignmentReaderKeys.all, 'pages', pageId] as const,
  },

  questionPointsTotal: (submissionId: string, expectedDocumentRevision: number) =>
    [
      ...assignmentReaderKeys.submission.detail(submissionId),
      'question-points-total',
      expectedDocumentRevision,
    ] as const,
} as const;
