import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUserProfile, updateEmailNotifications } from '../lib/user-api';
import { useAuth } from '../providers/auth-provider';

export function useEmailNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: fetchUserProfile,
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updateMutation = useMutation({
    mutationFn: updateEmailNotifications,
    onSuccess: (data) => {
      // Update the profile query cache with the new value
      queryClient.setQueryData(['user-profile', user?.id], (old: typeof profileQuery.data) =>
        old ? { ...old, emailNotificationsEnabledAt: data.emailNotificationsEnabledAt } : old,
      );
    },
  });

  const isEnabled =
    profileQuery.data?.emailNotificationsEnabledAt !== null &&
    profileQuery.data?.emailNotificationsEnabledAt !== undefined;

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    isEnabled,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] }),
  };
}
