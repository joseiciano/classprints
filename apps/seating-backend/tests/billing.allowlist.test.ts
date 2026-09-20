import { describe, expect, it } from 'vitest';
import { BillingService } from '@classprints/server/billing';
import type { BillingServiceConfig } from '@classprints/server/billing';
import type { Sql } from '@classprints/server/db/sql';

/**
 * Fake `sql` tagged-template that dispatches on the query text: the user
 * email lookup and the subscriptions lookup target different tables.
 * Anything unexpected rejects, so a wiring change fails loudly instead of
 * silently returning empty rows.
 */
const makeFakeSql = (tables: { user?: unknown[]; subscriptions?: unknown[] }) => {
  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join('$?');
    if (text.includes('from "user"')) {
      return Promise.resolve(tables.user ?? []);
    }
    if (text.includes('from subscriptions')) {
      return Promise.resolve(tables.subscriptions ?? []);
    }
    return Promise.reject(new Error(`Unexpected query: ${text}`));
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

const subscriptionRow = (overrides: Record<string, unknown> = {}) => ({
  user_id: 'user-1',
  stripe_subscription_id: 'sub_123',
  status: 'canceled',
  price_id: 'price_monthly',
  current_period_end: null,
  cancel_at_period_end: false,
  trial_end: null,
  updated_at: null,
  ...overrides,
});

describe('BillingService Plus email allowlist', () => {
  describe('getSubscription', () => {
    it.each([
      ['exact', 'icianojn@gmail.com'],
      ['case-insensitive', 'ICianoJN@gmail.com'],
      ['trimmed', '  icianojn@gmail.com  '],
    ])('force-grants plus for allowlisted email (%s) with no subscription row', async (_name, email) => {
      const service = new BillingService(makeFakeSql({ user: [{ email }] }), config);

      const result = await service.getSubscription('user-1');

      expect(result.status).toBe('active');
      expect(result.tier).toBe('plus');
      expect(result.subscription).toBeNull();
    });

    it('keeps free tier for non-allowlisted email with no subscription row', async () => {
      const service = new BillingService(
        makeFakeSql({ user: [{ email: 'someoneelse@gmail.com' }] }),
        config,
      );

      const result = await service.getSubscription('user-1');

      expect(result.status).toBe('none');
      expect(result.tier).toBe('free');
      expect(result.subscription).toBeNull();
    });

    it('does not override a canceled subscription for a non-allowlisted email', async () => {
      const service = new BillingService(
        makeFakeSql({
          user: [{ email: 'someoneelse@gmail.com' }],
          subscriptions: [subscriptionRow()],
        }),
        config,
      );

      const result = await service.getSubscription('user-1');

      expect(result.status).toBe('canceled');
      expect(result.tier).toBe('free');
      expect(result.subscription?.status).toBe('canceled');
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns active for an allowlisted email without consulting subscriptions', async () => {
      const service = new BillingService(
        makeFakeSql({ user: [{ email: 'icianojn@gmail.com' }] }),
        config,
      );

      await expect(service.getSubscriptionStatus('user-1')).resolves.toBe('active');
    });

    it('does not return active for a non-allowlisted email with an inactive subscription', async () => {
      const service = new BillingService(
        makeFakeSql({
          user: [{ email: 'someoneelse@gmail.com' }],
          subscriptions: [subscriptionRow({ status: 'past_due' })],
        }),
        config,
      );

      await expect(service.getSubscriptionStatus('user-1')).resolves.toBe('past_due');
    });

    it('returns none for a non-allowlisted email with no subscription row', async () => {
      const service = new BillingService(
        makeFakeSql({ user: [{ email: 'someoneelse@gmail.com' }] }),
        config,
      );

      await expect(service.getSubscriptionStatus('user-1')).resolves.toBe('none');
    });
  });
});
