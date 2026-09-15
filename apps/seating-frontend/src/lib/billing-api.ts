import type { BillingSubscriptionResponse, PlansResponse } from '@classprints/shared';
import { request } from './http';

export const fetchSubscription = () =>
  request<BillingSubscriptionResponse>('/billing/subscription');

export const fetchPlans = () => request<PlansResponse>('/billing/plans').then((res) => res.plans);

export const createCheckoutSession = async (
  plan: 'plus_monthly' | 'plus_quarterly' | 'plus_annual',
) => {
  const response = await request<{ url: string }>('/billing/checkout', {
    method: 'POST',
    body: { plan },
  });
  return response.url;
};

export const createPortalSession = async (returnUrl?: string) => {
  const response = await request<{ url: string }>('/billing/portal', {
    method: 'POST',
    body: { returnUrl },
  });
  return response.url;
};
