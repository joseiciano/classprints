import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSubscription, createCheckoutSession, createPortalSession } from '../lib/billing-api';
import { useAuth } from '../providers/auth-provider';

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const subscriptionQuery = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: fetchSubscription,
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const checkoutMutation = useMutation({
    mutationFn: (plan: 'plus_monthly' | 'plus_quarterly' | 'plus_annual') =>
      createCheckoutSession(plan),
    onSuccess: (url) => {
      window.location.href = url;
    },
  });

  const portalMutation = useMutation({
    mutationFn: createPortalSession,
    onSuccess: (url) => {
      window.location.href = url;
    },
  });

  return {
    subscription: subscriptionQuery.data,
    isLoading: subscriptionQuery.isLoading,
    error: subscriptionQuery.error,
    isPlus: subscriptionQuery.data?.tier === 'plus',
    checkout: checkoutMutation.mutate,
    isCheckingOut: checkoutMutation.isPending,
    openPortal: portalMutation.mutate,
    isOpeningPortal: portalMutation.isPending,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['subscription', user?.id] }),
  };
}
