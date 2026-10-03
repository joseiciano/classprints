// Search-param types, defaults, and validators for the assignment-reader
// routes. Deliberately free of React and component imports: `router.tsx`
// imports this eagerly for `validateSearch`, so anything it pulled in would
// land in the entry chunk and defeat the lazy page routes.
import type {
  AssignmentListQuery,
  ClassListQuery,
  DocumentType,
  SeatingChartListQuery,
  StudentListQuery,
  SubmissionListQuery,
} from '@classprints/assignment-reader-shared';

export interface ClassesSearch {
  q: string;
  sort: NonNullable<ClassListQuery['sort']>;
  direction: NonNullable<ClassListQuery['direction']>;
  page: number;
  status?: ClassListQuery['status'];
}

export const defaultClassesSearch: ClassesSearch = {
  q: '',
  sort: 'createdAt',
  direction: 'desc',
  page: 1,
};

export interface AssignmentsTabSearch {
  q: string;
  sort: NonNullable<AssignmentListQuery['sort']>;
  direction: NonNullable<AssignmentListQuery['direction']>;
  page: number;
  status?: AssignmentListQuery['status'];
}

export const defaultAssignmentsSearch: AssignmentsTabSearch = {
  q: '',
  sort: 'createdAt',
  direction: 'desc',
  page: 1,
};

export interface RosterPanelSearch {
  q: string;
  sort: NonNullable<StudentListQuery['sort']>;
  direction: NonNullable<StudentListQuery['direction']>;
  page: number;
  status?: StudentListQuery['status'];
}

export const defaultRosterSearch: RosterPanelSearch = {
  q: '',
  sort: 'name',
  direction: 'asc',
  page: 1,
  status: 'active',
};

export interface SeatingChartsTabSearch {
  q: string;
  sort: NonNullable<SeatingChartListQuery['sort']>;
  direction: NonNullable<SeatingChartListQuery['direction']>;
  page: number;
}

export const defaultSeatingChartsSearch: SeatingChartsTabSearch = {
  q: '',
  sort: 'createdAt',
  direction: 'desc',
  page: 1,
};

export interface SubmissionsSearch {
  q: string;
  sort: NonNullable<SubmissionListQuery['sort']>;
  direction: NonNullable<SubmissionListQuery['direction']>;
  page: number;
  status?: SubmissionListQuery['status'];
}

export const defaultSubmissionsSearch: SubmissionsSearch = {
  q: '',
  sort: 'studentName',
  direction: 'asc',
  page: 1,
};

export type ClassDashboardTab = 'assignments' | 'roster' | 'seating-charts';

export interface ClassDashboardSearch {
  tab: ClassDashboardTab;
  q: string;
  sort: string;
  direction: 'asc' | 'desc';
  page: number;
  status?: string;
}

export const defaultClassDashboardSearch: ClassDashboardSearch = {
  tab: 'assignments',
  ...defaultAssignmentsSearch,
};

export const classDashboardTabDefaults: Record<ClassDashboardTab, Omit<ClassDashboardSearch, 'tab'>> = {
  assignments: defaultAssignmentsSearch,
  roster: defaultRosterSearch,
  'seating-charts': defaultSeatingChartsSearch,
};

export interface DocumentWorkspaceSearch {
  /** Deep-links the workspace to one page, e.g. from the processing list's
   * per-page "Review now" action (TASK-023/025). Omitted, it defaults to the
   * first current page. */
  pageId?: string;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readDirection(value: unknown, fallback: 'asc' | 'desc'): 'asc' | 'desc' {
  return value === 'asc' || value === 'desc' ? value : fallback;
}

function readPage(value: unknown, fallback: number): number {
  const page = typeof value === 'string' ? Number(value) : value;
  return typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const CLASS_SORT_VALUES = ['createdAt', 'name', 'studentCount', 'assignmentCount', 'status'] as const;

export function validateClassesSearch(search: Record<string, unknown>): ClassesSearch {
  const sort = CLASS_SORT_VALUES.includes(search.sort as (typeof CLASS_SORT_VALUES)[number])
    ? (search.sort as ClassesSearch['sort'])
    : defaultClassesSearch.sort;
  return {
    q: readString(search.q, ''),
    sort,
    direction: readDirection(search.direction, defaultClassesSearch.direction),
    page: readPage(search.page, defaultClassesSearch.page),
    status: search.status === 'active' || search.status === 'archived' ? search.status : undefined,
  };
}

export function validateClassDashboardSearch(search: Record<string, unknown>): ClassDashboardSearch {
  const tab: ClassDashboardTab =
    search.tab === 'roster' || search.tab === 'seating-charts' ? search.tab : 'assignments';
  const defaults = classDashboardTabDefaults[tab];
  return {
    tab,
    q: readString(search.q, defaults.q),
    sort: readString(search.sort, defaults.sort),
    direction: readDirection(search.direction, defaults.direction),
    page: readPage(search.page, defaults.page),
    status: readOptionalString(search.status) ?? defaults.status,
  };
}

export function validateSubmissionsSearch(search: Record<string, unknown>): SubmissionsSearch {
  return {
    q: readString(search.q, ''),
    sort: (readOptionalString(search.sort) as SubmissionsSearch['sort']) ?? defaultSubmissionsSearch.sort,
    direction: readDirection(search.direction, defaultSubmissionsSearch.direction),
    page: readPage(search.page, defaultSubmissionsSearch.page),
    status: readOptionalString(search.status) as SubmissionsSearch['status'],
  };
}

export function validateDocumentWorkspaceSearch(search: Record<string, unknown>): DocumentWorkspaceSearch {
  return { pageId: typeof search.pageId === 'string' ? search.pageId : undefined };
}

export function asDocumentType(value: string): DocumentType {
  return value === 'submission' ? 'submission' : 'materials';
}
