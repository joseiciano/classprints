import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDraftMaterialVersion,
  deleteAssignmentMaterials,
  fetchMaterialVersion,
  fetchMaterialVersions,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useMaterialVersionsList(assignmentId: string, page: number | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.assignments.materialVersions.list(assignmentId, page),
    queryFn: () => fetchMaterialVersions(assignmentId, page),
    placeholderData: (previous) => previous,
  });
}

export function useMaterialVersion(materialVersionId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.materialVersion.detail(materialVersionId ?? ''),
    queryFn: () => fetchMaterialVersion(materialVersionId as string),
    enabled: Boolean(materialVersionId),
  });
}

/** Creates (or replays) the assignment's single draft material version. */
export function useCreateDraftMaterialVersion(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createDraftMaterialVersion(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.materialVersions.all(assignmentId),
      });
    },
  });
}

export function useDeleteAssignmentMaterials(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAssignmentMaterials(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.materialVersions.all(assignmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.detail(assignmentId),
      });
    },
  });
}
