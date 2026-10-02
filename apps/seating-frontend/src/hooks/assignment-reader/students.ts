import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateStudentBody,
  StudentListQuery,
  UpdateStudentBody,
} from '@classprints/assignment-reader-shared';
import {
  createStudent,
  deleteStudentData,
  fetchStudents,
  removeStudentFromRoster,
  updateStudent,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useStudentsList(classId: string, query: StudentListQuery) {
  return useQuery({
    queryKey: assignmentReaderKeys.classes.students.list(classId, query),
    queryFn: () => fetchStudents(classId, query),
    placeholderData: (previous) => previous,
  });
}

function invalidateRoster(
  queryClient: ReturnType<typeof useQueryClient>,
  classId: string,
) {
  void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.students.all(classId) });
  // Roster size is displayed on the class record itself (Students column).
  void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.detail(classId) });
  void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.all() });
}

export function useCreateStudent(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateStudentBody) => createStudent(classId, body),
    onSuccess: () => invalidateRoster(queryClient, classId),
  });
}

export function useRenameStudent(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, body }: { studentId: string; body: UpdateStudentBody }) =>
      updateStudent(classId, studentId, body),
    onSuccess: () => invalidateRoster(queryClient, classId),
  });
}

export function useRemoveStudentFromRoster(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => removeStudentFromRoster(classId, studentId),
    onSuccess: () => invalidateRoster(queryClient, classId),
  });
}

/** Destructive: deletes the roster record, its submissions, and every page they own. */
export function useDeleteStudentData(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => deleteStudentData(classId, studentId),
    onSuccess: () => {
      invalidateRoster(queryClient, classId);
      // The deleted student's submissions may be visible in any of this
      // class's assignment submission lists; those keys are nested under
      // each assignment rather than the class, so a broad assignment-reader
      // invalidation keeps them from showing a now-deleted student stale.
      // Mounted lists still refetch and drop the row immediately because the
      // submissions route left-joins the (now gone) roster record.
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.all });
    },
  });
}
