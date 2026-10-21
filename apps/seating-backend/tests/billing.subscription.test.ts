import { describe, expect, it } from 'vitest';
import { BillingService } from '@classprints/server/billing';
import type { BillingServiceConfig } from '@classprints/server/billing';
import type { Sql } from '@classprints/server/db/sql';

type SubscriptionRow = {
  user_id: string;
  stripe_subscription_id: string;
  status: string;
  price_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string | null;
};

type FakeTables = {
  user: Array<{ email: string | null }>;
  subscriptions: SubscriptionRow[];
};

const subscriptionRow = (status: string, priceId: string): SubscriptionRow => ({
  user_id: 'user-1',
  stripe_subscription_id: 'sub_123',
  status,
  price_id: priceId,
  current_period_end: '2026-11-01T00:00:00.000Z',
  cancel_at_period_end: false,
  updated_at: '2026-10-01T00:00:00.000Z',
});

const makeFakeSql = (tables: FakeTables): Sql => {
  const sql = ((strings: TemplateStringsArray) => {
    const query = strings.join('$?');
    if (query.includes('from "user"')) {
      return Promise.resolve(tables.user);
    }
    if (query.includes('from subscriptions')) {
      return Promise.resolve(tables.subscriptions);
    }
    throw new Error(`Unexpected query: ${query}`);
  }) as unknown as Sql;

  return sql;
};

const config: BillingServiceConfig = {
  stripeSecretKey: 'sk_test_dummy_key',
  stripeWebhookSecret: 'whsec_dummy',
  checkoutSuccessUrl: 'https://example.com/success',
  checkoutCancelUrl: 'https://example.com/cancel',
  portalReturnUrl: 'https://example.com/portal',
  priceIds: {
    plusMonthly: 'price_monthly',
    plusQuarterly: 'price_quarterly',
    plusAnnual: 'price_annual',
  },
};

describe('BillingService subscription response', () => {
  it('returns free when formerly allowlisted email has no subscription', async () => {
    const service = new BillingService(
      makeFakeSql({
        user: [{ email: 'icianojn@gmail.com' }],
        subscriptions: [],
      }),
      config,
    );

    const result = await service.getSubscription('user-1');

    expect(result).toMatchObject({
      status: 'none',
      tier: 'free',
      subscription: null,
    });
  });

  it.each([
    { name: 'canceled', status: 'canceled', priceId: 'price_monthly' },
    { name: 'incomplete_expired', status: 'incomplete_expired', priceId: 'price_annual' },
  ])(
    'reports no current plan for an ended ($name) subscription that kept its price_id',
    async ({ status, priceId }) => {
      const service = new BillingService(
        makeFakeSql({ user: [], subscriptions: [subscriptionRow(status, priceId)] }),
        config,
      );

      const result = await service.getSubscription('user-1');

      expect(result).toMatchObject({ status: 'canceled', tier: 'free', planId: null });
    },
  );

  it('resolves planId from price_id and grants plus for an active subscription', async () => {
    const service = new BillingService(
      makeFakeSql({ user: [], subscriptions: [subscriptionRow('active', 'price_annual')] }),
      config,
    );

    const result = await service.getSubscription('user-1');

    expect(result).toMatchObject({ status: 'active', tier: 'plus', planId: 'plus_annual' });
  });

  it('keeps the plan but drops to free tier for a past_due subscription', async () => {
    const service = new BillingService(
      makeFakeSql({ user: [], subscriptions: [subscriptionRow('past_due', 'price_quarterly')] }),
      config,
    );

    const result = await service.getSubscription('user-1');

    expect(result).toMatchObject({ status: 'past_due', tier: 'free', planId: 'plus_quarterly' });
  });
});
