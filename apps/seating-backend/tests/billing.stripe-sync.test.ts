import { describe, expect, it } from 'vitest';
import { BillingService } from '@classprints/server/billing';
import type { BillingServiceConfig } from '@classprints/server/billing';
import type { Sql } from '@classprints/server/db/sql';

type CustomerRow = { user_id: string; stripe_customer_id: string; created_at: string | null };
type SubscriptionRow = {
  user_id: string;
  stripe_subscription_id: string;
  status: string;
  price_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  updated_at: string;
};

type FakeDb = {
  customers: Map<string, CustomerRow>;
  subscriptions: Map<string, SubscriptionRow>;
};

// In-memory stand-in for the billing_customers / subscriptions tables, keyed by user_id
// like the real `on conflict (user_id)` upserts.
const makeFakeSql = (db: FakeDb): Sql => {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join('$?');
    if (query.includes('insert into billing_customers')) {
      const [userId, stripeCustomerId] = values as [string, string];
      const row = { user_id: userId, stripe_customer_id: stripeCustomerId, created_at: null };
      db.customers.set(userId, row);
      return Promise.resolve([row]);
    }
    if (query.includes('from billing_customers where user_id')) {
      const row = db.customers.get(values[0] as string);
      return Promise.resolve(row ? [row] : []);
    }
    if (query.includes('from billing_customers where stripe_customer_id')) {
      const row = [...db.customers.values()].find((c) => c.stripe_customer_id === values[0]);
      return Promise.resolve(row ? [row] : []);
    }
    if (query.includes('insert into subscriptions')) {
      const [userId, id, status, priceId, cpe, cap, trialEnd, updatedAt] = values as [
        string,
        string,
        string,
        string,
        string | null,
        boolean,
        string | null,
        string,
      ];
      const row: SubscriptionRow = {
        user_id: userId,
        stripe_subscription_id: id,
        status,
        price_id: priceId,
        current_period_end: cpe,
        cancel_at_period_end: cap,
        trial_end: trialEnd,
        updated_at: updatedAt,
      };
      db.subscriptions.set(userId, row);
      return Promise.resolve([row]);
    }
    if (query.includes('from subscriptions where user_id')) {
      const row = db.subscriptions.get(values[0] as string);
      return Promise.resolve(row ? [row] : []);
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

const USER = 'user-1';
const CUSTOMER = 'cus_1';
const PERIOD_END = 1_900_000_000;

const stripeSubscription = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  customer: CUSTOMER,
  metadata: { user_id: USER },
  items: { data: [{ price: { id: 'price_monthly' } }] },
  current_period_end: PERIOD_END,
  cancel_at_period_end: false,
  trial_end: null,
  ...extra,
});

const storedRow = (id: string, status: string): SubscriptionRow => ({
  user_id: USER,
  stripe_subscription_id: id,
  status,
  price_id: 'price_monthly',
  current_period_end: null,
  cancel_at_period_end: false,
  trial_end: null,
  updated_at: '2026-01-01T00:00:00.000Z',
});

// Stripe fake: the webhook "verifies" by parsing the raw body; retrieve serves the
// authoritative state and fails loudly for ids Stripe doesn't know.
const setup = (opts: {
  stripeState?: Record<string, ReturnType<typeof stripeSubscription>>;
  stored?: SubscriptionRow;
}) => {
  const db: FakeDb = { customers: new Map(), subscriptions: new Map() };
  if (opts.stored) db.subscriptions.set(USER, opts.stored);
  const service = new BillingService(makeFakeSql(db), config);
  const retrieved: string[] = [];
  const checkoutSessions: unknown[] = [];
  (service as any).stripe = {
    webhooks: {
      constructEventAsync: async (rawBody: string) => JSON.parse(rawBody),
    },
    subscriptions: {
      retrieve: async (id: string) => {
        retrieved.push(id);
        const sub = opts.stripeState?.[id];
        if (!sub) throw new Error(`No such subscription: ${id}`);
        return sub;
      },
    },
    customers: {
      create: async () => ({ id: CUSTOMER }),
    },
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          checkoutSessions.push(params);
          return { url: 'https://checkout.stripe.test/session' };
        },
      },
    },
  };
  const deliver = (type: string, object: unknown) =>
    service.handleWebhookEvent(JSON.stringify({ type, data: { object } }), 'sig');
  return { service, db, retrieved, checkoutSessions, deliver };
};

// A stale payload: wrong status and no current_period_end (as newer API versions deliver it).
const staleSubscriptionPayload = {
  id: 'sub_1',
  status: 'incomplete',
  customer: CUSTOMER,
  metadata: { user_id: USER },
  items: { data: [{ price: { id: 'price_monthly' } }] },
};

describe('BillingService webhook sync re-fetches subscription state from Stripe', () => {
  it.each([
    { type: 'customer.subscription.created', object: staleSubscriptionPayload },
    { type: 'customer.subscription.updated', object: staleSubscriptionPayload },
    { type: 'customer.subscription.deleted', object: staleSubscriptionPayload },
    {
      type: 'invoice.payment_succeeded',
      object: { id: 'in_1', customer: CUSTOMER, subscription: 'sub_1' },
    },
    {
      type: 'invoice.payment_failed',
      object: { id: 'in_1', customer: CUSTOMER, subscription: 'sub_1' },
    },
    {
      type: 'invoice.payment_succeeded (parent.subscription_details)',
      object: {
        id: 'in_1',
        customer: CUSTOMER,
        parent: { subscription_details: { subscription: 'sub_1' } },
      },
    },
    {
      type: 'invoice.payment_failed (parent.subscription_details)',
      object: {
        id: 'in_1',
        customer: CUSTOMER,
        subscription: null,
        parent: { subscription_details: { subscription: 'sub_1' } },
      },
    },
  ])('$type stores the retrieved status and period end', async ({ type, object }) => {
    const { db, deliver } = setup({
      stripeState: { sub_1: stripeSubscription('sub_1', 'active') },
    });

    await deliver(type.split(' ')[0], object);

    expect(db.subscriptions.get(USER)).toMatchObject({
      stripe_subscription_id: 'sub_1',
      status: 'active',
      current_period_end: new Date(PERIOD_END * 1000).toISOString(),
    });
  });

  it('ignores invoices that reference no subscription', async () => {
    const { db, retrieved, deliver } = setup({
      stripeState: { sub_1: stripeSubscription('sub_1', 'active') },
    });

    await deliver('invoice.payment_succeeded', {
      id: 'in_1',
      customer: CUSTOMER,
      subscription: null,
      parent: { subscription_details: null },
    });

    expect(retrieved).toEqual([]);
    expect(db.subscriptions.size).toBe(0);
  });
});

describe('BillingService webhook sync does not let an ended subscription supersede a live one', () => {
  it.each([
    {
      name: 'other sub canceled while stored sub active -> keep stored',
      stored: storedRow('sub_old', 'active'),
      incoming: stripeSubscription('sub_new', 'canceled'),
      expected: { stripe_subscription_id: 'sub_old', status: 'active' },
    },
    {
      name: 'other sub incomplete_expired while stored sub past_due -> keep stored',
      stored: storedRow('sub_old', 'past_due'),
      incoming: stripeSubscription('sub_new', 'incomplete_expired'),
      expected: { stripe_subscription_id: 'sub_old', status: 'past_due' },
    },
    {
      name: 'other sub canceled while stored sub paused -> keep stored',
      stored: storedRow('sub_old', 'paused'),
      incoming: stripeSubscription('sub_new', 'canceled'),
      expected: { stripe_subscription_id: 'sub_old', status: 'paused' },
    },
    {
      name: 'other sub live while stored sub active -> overwrite',
      stored: storedRow('sub_old', 'active'),
      incoming: stripeSubscription('sub_new', 'trialing'),
      expected: { stripe_subscription_id: 'sub_new', status: 'trialing' },
    },
    {
      name: 'same sub canceled while stored active -> overwrite',
      stored: storedRow('sub_same', 'active'),
      incoming: stripeSubscription('sub_same', 'canceled'),
      expected: { stripe_subscription_id: 'sub_same', status: 'canceled' },
    },
    {
      name: 'other sub canceled while stored sub canceled -> overwrite',
      stored: storedRow('sub_old', 'canceled'),
      incoming: stripeSubscription('sub_new', 'canceled'),
      expected: { stripe_subscription_id: 'sub_new', status: 'canceled' },
    },
  ])('$name', async ({ stored, incoming, expected }) => {
    const { db, deliver } = setup({ stored, stripeState: { [incoming.id]: incoming } });

    await deliver('customer.subscription.deleted', { id: incoming.id });

    expect(db.subscriptions.get(USER)).toMatchObject(expected);
  });
});

describe('BillingService.createCheckoutSession', () => {
  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused'])(
    'rejects with 409 when the stored subscription is %s',
    async (status) => {
      const { service, checkoutSessions } = setup({ stored: storedRow('sub_old', status) });

      await expect(
        service.createCheckoutSession(USER, 'plus_monthly', 'https://s', 'https://c'),
      ).rejects.toMatchObject({ status: 409 });
      expect(checkoutSessions).toEqual([]);
    },
  );

  it.each([
    { name: 'no subscription', stored: undefined },
    { name: 'canceled', stored: storedRow('sub_old', 'canceled') },
    { name: 'incomplete_expired', stored: storedRow('sub_old', 'incomplete_expired') },
    { name: 'incomplete', stored: storedRow('sub_old', 'incomplete') },
  ])('creates a checkout session when the user has $name', async ({ stored }) => {
    const { service, checkoutSessions } = setup({ stored });

    const url = await service.createCheckoutSession(USER, 'plus_monthly', 'https://s', 'https://c');

    expect(url).toBe('https://checkout.stripe.test/session');
    expect(checkoutSessions).toHaveLength(1);
  });
});
