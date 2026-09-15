import { z } from 'zod';

export const billingCustomerSchema = z.object({
  user_id: z.string().uuid(),
  stripe_customer_id: z.string().min(1),
  created_at: z.string().optional(),
});

export type BillingCustomer = z.infer<typeof billingCustomerSchema>;

export const subscriptionSchema = z.object({
  user_id: z.string().uuid(),
  stripe_subscription_id: z.string().min(1),
  status: z.string().min(1),
  price_id: z.string().min(1),
  current_period_end: z.string().nullable().optional(),
  cancel_at_period_end: z.boolean().optional(),
  updated_at: z.string().optional(),
});

export type BillingSubscription = z.infer<typeof subscriptionSchema>;

export const checkoutRequestSchema = z.object({
  plan: z.enum(['plus_monthly', 'plus_quarterly', 'plus_annual']),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const portalRequestSchema = z.object({
  returnUrl: z.string().url().optional(),
});

export type PortalRequest = z.infer<typeof portalRequestSchema>;

export type BillingSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'none';

export interface BillingSubscriptionResponse {
  status: BillingSubscriptionStatus;
  tier: 'free' | 'plus';
  planId: 'plus_monthly' | 'plus_quarterly' | 'plus_annual' | null;
  subscription: BillingSubscription | null;
}

export interface BillingPlan {
  id: 'plus_monthly' | 'plus_quarterly' | 'plus_annual';
  name: string;
  price: number;
  period: 'month' | 'quarter' | 'year';
  description: string;
  features: string[];
  stripePriceId: string;
}

export interface PlansResponse {
  plans: BillingPlan[];
}
