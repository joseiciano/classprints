import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClassListQuery,
  CreateClassBody,
  UpdateClassBody,
} from '@classprints/assignment-reader-shared';
import {
  createClass,
  deleteClass,
  fetchClass,
  fetchClasses,
  updateClass,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useClassesList(query: ClassListQuery) {
  return useQuery({
    queryKey: assignmentReaderKeys.classes.list(query),
    queryFn: () => fetchClasses(query),
    placeholderData: (previous) => previous,
  });
}

export function useClass(classId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.classes.detail(classId ?? ''),
    queryFn: () => fetchClass(classId as string),
    enabled: Boolean(classId),
  });
}

export function useCreateClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateClassBody) => createClass(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.all() });
    },
  });
}

export function useUpdateClass(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateClassBody) => updateClass(classId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.detail(classId) });
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.all() });
    },
  });
}

export function useDeleteClass(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteClass(classId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.detail(classId) });
      void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.classes.all() });
    },
  });
}
