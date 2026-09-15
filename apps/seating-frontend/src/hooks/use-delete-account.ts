import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/auth-provider';

interface DeleteAccountResponse {
  success: boolean;
  message: string;
  deletedAt: string;
}

export async function deleteAccount(): Promise<DeleteAccountResponse> {
  const response = await fetch('/api/v1/user/account', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Failed to delete account');
  }

  return data;
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
