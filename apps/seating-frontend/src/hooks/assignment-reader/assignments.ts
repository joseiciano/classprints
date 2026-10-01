import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignmentListQuery,
  CreateAssignmentBody,
  UpdateAssignmentBody,
} from '@classprints/assignment-reader-shared';
import {
  createAssignment,
  deleteAssignment,
  fetchAssignment,
  fetchAssignments,
  updateAssignment,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useAssignmentsList(classId: string, query: AssignmentListQuery) {
  return useQuery({
    queryKey: assignmentReaderKeys.classes.assignments.list(classId, query),
    queryFn: () => fetchAssignments(classId, query),
    placeholderData: (previous) => previous,
  });
}

export function useAssignment(assignmentId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.assignments.detail(assignmentId ?? ''),
    queryFn: () => fetchAssignment(assignmentId as string),
    enabled: Boolean(assignmentId),
    // The assignment route must show live processing/review/grading state
    // (materials counts, PAT-003 status) without a manual refresh.
    refetchInterval: 5000,
  });
}

export function useCreateAssignment(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssignmentBody) => createAssignment(classId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.classes.assignments.all(classId),
      });
      // `ClassRecord.assignmentCount` is a displayed column on the class list.
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.all() });
    },
  });
}

export function useUpdateAssignment(assignmentId: string, classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAssignmentBody) => updateAssignment(assignmentId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.detail(assignmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.classes.assignments.all(classId),
      });
    },
  });
}

export function useDeleteAssignment(assignmentId: string, classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.detail(assignmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.classes.assignments.all(classId),
      });
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.all() });
    },
  });
}
