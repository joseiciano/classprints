import { useMutation, useQueryClient } from '@tanstack/react-query';
import { csrfHeaders } from '@classprints/shared';
import type { DataResponse, DeletionOperation } from '@classprints/assignment-reader-shared';
import { useAuth } from '../providers/auth-provider';

/**
 * Accepting this request immediately disables account access and revokes
 * sessions server-side (api-routes-review.md §3.1), so the response is a
 * pending `DeletionOperation`, not a "done" confirmation — the sign-out and
 * redirect below never restore access regardless of what this returns.
 */
export async function deleteAccount(): Promise<DeletionOperation> {
  const response = await fetch('/api/v1/user/account', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(),
    },
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Failed to delete account');
  }

  return (data as DataResponse<DeletionOperation>).data;
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const mutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      // Invalidate all queries
      await queryClient.invalidateQueries();
      // Sign out user
      await signOut.mutateAsync();
      // Redirect to home page
      window.location.href = '/';
    },
  });

  return {
    deleteAccount: mutation.mutate,
    isDeleting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
