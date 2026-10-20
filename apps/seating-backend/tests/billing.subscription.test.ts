import { describe, expect, it } from 'vitest';
import { BillingService } from '@classprints/server/billing';
import type { BillingServiceConfig } from '@classprints/server/billing';
import type { Sql } from '@classprints/server/db/sql';

type FakeTables = {
  user: Array<{ email: string | null }>;
  subscriptions: never[];
};

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
});
