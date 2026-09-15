import type Stripe from 'stripe';
import { HttpError } from '../http';
import type { BillingCustomer, BillingSubscription } from './types';
import type { Sql } from '../db/sql';

const toTimestamp = (unixSeconds?: number | null): string | null => {
  if (!unixSeconds) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
};

interface BillingCustomerRow {
  user_id: string;
  stripe_customer_id: string;
  created_at: Date | string | null;
}

interface SubscriptionRow {
  user_id: string;
  stripe_subscription_id: string;
  status: string;
  price_id: string;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean | null;
  trial_end?: Date | string | null;
  updated_at: Date | string | null;
}

const iso = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
};

const mapCustomer = (row: BillingCustomerRow): BillingCustomer => ({
  user_id: row.user_id,
  stripe_customer_id: row.stripe_customer_id,
  created_at: iso(row.created_at) ?? undefined,
});

const mapSubscription = (row: SubscriptionRow): BillingSubscription => ({
  user_id: row.user_id,
  stripe_subscription_id: row.stripe_subscription_id,
  status: row.status,
  price_id: row.price_id,
  current_period_end: iso(row.current_period_end),
  cancel_at_period_end: row.cancel_at_period_end ?? false,
  updated_at: iso(row.updated_at) ?? undefined,
});

export class BillingRepository {
  constructor(private readonly sql: Sql) {}

  async getCustomerByUserId(userId: string): Promise<BillingCustomer | null> {
    const rows = await this.sql`
      select user_id, stripe_customer_id, created_at
      from billing_customers where user_id = ${userId} limit 1
    `;
    const row = rows[0] as BillingCustomerRow | undefined;
    return row ? mapCustomer(row) : null;
  }

  async getCustomerByStripeCustomerId(stripeCustomerId: string): Promise<BillingCustomer | null> {
    const rows = await this.sql`
      select user_id, stripe_customer_id, created_at
      from billing_customers where stripe_customer_id = ${stripeCustomerId} limit 1
    `;
    const row = rows[0] as BillingCustomerRow | undefined;
    return row ? mapCustomer(row) : null;
  }

  async upsertCustomer(userId: string, stripeCustomerId: string): Promise<BillingCustomer> {
    const rows = await this.sql`
      insert into billing_customers (user_id, stripe_customer_id)
      values (${userId}, ${stripeCustomerId})
      on conflict (user_id) do update
      set stripe_customer_id = excluded.stripe_customer_id
      returning user_id, stripe_customer_id, created_at
    `;
    const row = rows[0] as BillingCustomerRow | undefined;
    if (!row) {
      throw new HttpError(500, 'Failed to upsert billing customer');
    }
    return mapCustomer(row);
  }

  async upsertSubscriptionFromStripe(
    userId: string,
    subscription: Stripe.Subscription,
  ): Promise<BillingSubscription> {
    const priceId = subscription.items.data[0]?.price?.id ?? '';
    if (!priceId) {
      throw new HttpError(500, 'Stripe subscription missing price id');
    }

    const rows = await this.sql`
      insert into subscriptions (
        user_id, stripe_subscription_id, status, price_id,
        current_period_end, cancel_at_period_end, trial_end, updated_at
      )
      values (
        ${userId}, ${subscription.id}, ${subscription.status}, ${priceId},
        ${toTimestamp(subscription.current_period_end)},
        ${subscription.cancel_at_period_end ?? false},
        ${toTimestamp(subscription.trial_end)},
        ${new Date().toISOString()}
      )
      on conflict (user_id) do update
      set
        stripe_subscription_id = excluded.stripe_subscription_id,
        status = excluded.status,
        price_id = excluded.price_id,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        trial_end = excluded.trial_end,
        updated_at = excluded.updated_at
      returning user_id, stripe_subscription_id, status, price_id,
                current_period_end, cancel_at_period_end, trial_end, updated_at
    `;
    const row = rows[0] as SubscriptionRow | undefined;
    if (!row) {
      throw new HttpError(500, 'Failed to upsert subscription');
    }
    return mapSubscription(row);
  }

  async upsertSubscriptionStatus(userId: string, status: string): Promise<void> {
    await this.sql`
      update subscriptions set status = ${status}, updated_at = ${new Date().toISOString()}
      where user_id = ${userId}
    `;
  }

  async getSubscriptionByUserId(userId: string): Promise<BillingSubscription | null> {
    const rows = await this.sql`
      select user_id, stripe_subscription_id, status, price_id,
             current_period_end, cancel_at_period_end, trial_end, updated_at
      from subscriptions where user_id = ${userId} limit 1
    `;
    const row = rows[0] as SubscriptionRow | undefined;
    return row ? mapSubscription(row) : null;
  }
}
