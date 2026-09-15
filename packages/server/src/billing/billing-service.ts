import Stripe from 'stripe';
import type { Sql } from '../db/sql';
import { HttpError } from '../http';
import { BillingRepository } from './billing-repository';
import type { BillingPlan, BillingSubscriptionResponse, BillingSubscriptionStatus } from './types';

export interface StripePriceConfig {
  plusMonthly: string;
  plusQuarterly: string;
  plusAnnual: string;
}

export interface BillingServiceConfig {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
  portalReturnUrl: string;
  priceIds: StripePriceConfig;
  logger?: Pick<typeof console, 'info' | 'warn' | 'error'>;
}

export class BillingService {
  private readonly stripe: Stripe;
  private readonly repository: BillingRepository;

  constructor(
    sql: Sql,
    private readonly config: BillingServiceConfig,
  ) {
    this.repository = new BillingRepository(sql);
    if (!config.stripeSecretKey) {
      console.error('[CRITICAL] Stripe Secret Key is MISSING in BillingService constructor');
    } else {
      console.log('[DEBUG] Stripe Key starts with:', config.stripeSecretKey.substring(0, 7));
    }
    this.stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });
  }

  async createCheckoutSession(
    userId: string,
    plan: 'plus_monthly' | 'plus_quarterly' | 'plus_annual',
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    // Check if user already has an active subscription
    const subscriptionStatus = await this.getSubscriptionStatus(userId);
    if (subscriptionStatus === 'active') {
      throw new HttpError(409, 'User already has an active subscription');
    }

    const priceId = this.resolvePriceId(plan);
    const stripeCustomerId = await this.ensureStripeCustomer(userId);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      subscription_data: {
        metadata: {
          user_id: userId,
        },
      },
    });

    if (!session.url) {
      throw new HttpError(502, 'Stripe did not return a checkout URL');
    }

    return session.url;
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<string> {
    const stripeCustomerId = await this.ensureStripeCustomer(userId);
    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    if (!session.url) {
      throw new HttpError(502, 'Stripe did not return a portal URL');
    }

    return session.url;
  }

  async getSubscriptionStatus(userId: string): Promise<BillingSubscriptionStatus> {
    const subscription = await this.repository.getSubscriptionByUserId(userId);
    if (!subscription) {
      return 'none';
    }

    return this.mapStripeStatus(subscription.status);
  }

  async getSubscription(userId: string): Promise<BillingSubscriptionResponse> {
    const subscription = await this.repository.getSubscriptionByUserId(userId);
    const status = subscription ? this.mapStripeStatus(subscription.status) : 'none';
    const tier = status === 'active' ? 'plus' : 'free';
    const planId = this.getPlanIdFromPriceId(subscription?.price_id ?? null);

    return {
      status,
      tier,
      planId,
      subscription,
    };
  }

  getAvailablePlans(): BillingPlan[] {
    return [
      {
        id: 'plus_monthly',
        name: 'Plus',
        price: 3,
        period: 'month',
        description: 'Advanced features on top of Free tier usage.',
        features: [
          'Increased usage, generate up to 10 arrangements per week.',
          'Increased arrangements, generate up to 5 per use.',
          'Save profiles to make be reused later on.',
          'CSV Export resulting arrangements.',
          'Email support for sending resulting arrangements.',
        ],
        stripePriceId: this.config.priceIds.plusMonthly,
      },
      {
        id: 'plus_quarterly',
        name: 'Plus',
        price: 7,
        period: 'quarter',
        description: 'Advanced features on top of Free tier usage.',
        features: [
          'Increased usage, generate up to 10 arrangements per week.',
          'Increased arrangements, generate up to 5 per use.',
          'Save profiles to make be reused later on.',
          'CSV Export resulting arrangements.',
          'Email support for sending resulting arrangements.',
        ],
        stripePriceId: this.config.priceIds.plusQuarterly,
      },
      {
        id: 'plus_annual',
        name: 'Plus',
        price: 21,
        period: 'year',
        description: 'Advanced features on top of Free tier usage.',
        features: [
          'Increased usage, generate up to 10 arrangements per week.',
          'Increased arrangements, generate up to 5 per use.',
          'Save profiles to make be reused later on.',
          'CSV Export resulting arrangements.',
          'Email support for sending resulting arrangements.',
        ],
        stripePriceId: this.config.priceIds.plusAnnual,
      },
    ];
  }

  private getPlanIdFromPriceId(
    priceId: string | null,
  ): 'plus_monthly' | 'plus_quarterly' | 'plus_annual' | null {
    if (!priceId) return null;
    if (priceId === this.config.priceIds.plusMonthly) return 'plus_monthly';
    if (priceId === this.config.priceIds.plusQuarterly) return 'plus_quarterly';
    if (priceId === this.config.priceIds.plusAnnual) return 'plus_annual';
    return null;
  }

  async cancelSubscription(userId: string): Promise<void> {
    const subscription = await this.repository.getSubscriptionByUserId(userId);
    if (!subscription?.stripe_subscription_id) {
      this.config.logger?.warn?.(`No Stripe subscription found for user ${userId}`);
      return;
    }

    try {
      await this.stripe.subscriptions.cancel(subscription.stripe_subscription_id);
      this.config.logger?.info?.(
        `Cancelled subscription ${subscription.stripe_subscription_id} for user ${userId}`,
      );

      // Update local subscription status
      await this.repository.upsertSubscriptionStatus(userId, 'canceled');
    } catch (error) {
      this.config.logger?.error?.(`Failed to cancel subscription for user ${userId}:`, error);
      throw new HttpError(500, 'Failed to cancel Stripe subscription');
    }
  }

  async handleWebhookEvent(rawBody: string, signature: string): Promise<void> {
    const event = await this.stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      this.config.stripeWebhookSecret,
    );

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        return;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        return;
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        await this.handleInvoiceEvent(event.data.object as Stripe.Invoice);
        return;
      default:
        this.config.logger?.info?.(`Ignoring Stripe event ${event.type}`);
        return;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const stripeCustomerId = this.ensureStripeCustomerId(session.customer);
    const userId = await this.resolveUserId(
      session.metadata?.user_id,
      session.client_reference_id,
      stripeCustomerId,
    );

    await this.repository.upsertCustomer(userId, stripeCustomerId);

    if (!session.subscription) {
      return;
    }

    const subscriptionId = this.ensureStripeSubscriptionId(session.subscription);
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    await this.repository.upsertSubscriptionFromStripe(userId, subscription);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const stripeCustomerId = this.ensureStripeCustomerId(subscription.customer);
    const userId = await this.resolveUserId(
      subscription.metadata?.user_id,
      undefined,
      stripeCustomerId,
    );
    await this.repository.upsertCustomer(userId, stripeCustomerId);
    await this.repository.upsertSubscriptionFromStripe(userId, subscription);
  }

  private async handleInvoiceEvent(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) {
      return;
    }

    const subscriptionId = this.ensureStripeSubscriptionId(invoice.subscription);
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const stripeCustomerId = this.ensureStripeCustomerId(subscription.customer);
    const userId = await this.resolveUserId(
      subscription.metadata?.user_id,
      undefined,
      stripeCustomerId,
    );

    await this.repository.upsertCustomer(userId, stripeCustomerId);
    await this.repository.upsertSubscriptionFromStripe(userId, subscription);
  }

  private async ensureStripeCustomer(userId: string): Promise<string> {
    const existing = await this.repository.getCustomerByUserId(userId);
    if (existing?.stripe_customer_id) {
      return existing.stripe_customer_id;
    }

    const customer = await this.stripe.customers.create({
      metadata: { user_id: userId },
    });

    await this.repository.upsertCustomer(userId, customer.id);
    return customer.id;
  }

  private ensureStripeCustomerId(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): string {
    if (!customer) {
      throw new HttpError(400, 'Stripe event missing customer id');
    }

    if (typeof customer === 'string') {
      return customer;
    }

    if ('deleted' in customer && customer.deleted) {
      throw new HttpError(400, 'Stripe customer deleted');
    }

    return customer.id;
  }

  private ensureStripeSubscriptionId(subscription: string | Stripe.Subscription | null): string {
    if (!subscription) {
      throw new HttpError(400, 'Stripe event missing subscription id');
    }
    return typeof subscription === 'string' ? subscription : subscription.id;
  }

  private async resolveUserId(
    metadataUserId: string | undefined,
    clientReferenceId: string | null | undefined,
    stripeCustomerId: string,
  ): Promise<string> {
    if (metadataUserId) {
      return metadataUserId;
    }

    if (clientReferenceId) {
      return clientReferenceId;
    }

    const customer = await this.repository.getCustomerByStripeCustomerId(stripeCustomerId);
    if (customer?.user_id) {
      return customer.user_id;
    }

    throw new HttpError(400, 'Unable to resolve user id for Stripe event');
  }

  private mapStripeStatus(status: string): BillingSubscriptionStatus {
    switch (status) {
      case 'active':
        return 'active';
      case 'past_due':
      case 'unpaid':
        return 'past_due';
      case 'canceled':
      case 'incomplete_expired':
      default:
        return 'canceled';
    }
  }

  private resolvePriceId(plan: 'plus_monthly' | 'plus_quarterly' | 'plus_annual'): string {
    switch (plan) {
      case 'plus_monthly':
        return this.config.priceIds.plusMonthly;
      case 'plus_quarterly':
        return this.config.priceIds.plusQuarterly;
      case 'plus_annual':
        return this.config.priceIds.plusAnnual;
      default:
        throw new HttpError(400, 'Unknown plan');
    }
  }
}
