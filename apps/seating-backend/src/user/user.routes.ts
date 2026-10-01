import type { Hono } from 'hono';
import type { Context } from 'hono';
import type { SeatingHonoEnv } from '../types/env';
import { HttpError } from '../lib/http-error';
import { z } from 'zod';
import { createDb } from '../lib/db';
import { createAuthServiceFor } from '@classprints/server/auth';
import type { AuthenticatedUser } from '@classprints/server/auth';
import { BillingService, type BillingServiceConfig } from '@classprints/server/billing';
import { createAssignmentReaderRepository } from '../assignment-reader/assignment-reader.repository';
import {
  AssignmentReaderService,
  type AssignmentReaderQueues,
} from '../assignment-reader/assignment-reader.service';
import type { DeletionOperation } from '@classprints/assignment-reader-shared';

const getUser = (c: Context<SeatingHonoEnv>): AuthenticatedUser | undefined =>
  c.get('user' as never) as AuthenticatedUser | undefined;

/** Wires only what TASK-018 account deletion needs (repo + the cleanup
 * queue); it never touches images/transcription, unlike the assignment-reader
 * subapp's own `createService`. */
const createAssignmentReaderServiceForDeletion = (c: Context<SeatingHonoEnv>): AssignmentReaderService => {
  const repo = createAssignmentReaderRepository(createDb(c.env));
  const queues: AssignmentReaderQueues = {
    sendTranscriptionPage: async (message) => {
      await c.env.TRANSCRIPTION_JOBS.send(message);
    },
    sendDeletionOperation: async (message) => {
      await c.env.DOCUMENT_CLEANUP_JOBS.send(message);
    },
  };
  return new AssignmentReaderService({ repo, queues });
};

const createBillingService = (c: Context<SeatingHonoEnv>): BillingService => {
  const sql = createDb(c.env);
  const config: BillingServiceConfig = {
    stripeSecretKey: c.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
    checkoutSuccessUrl: c.env.STRIPE_CHECKOUT_SUCCESS_URL,
    checkoutCancelUrl: c.env.STRIPE_CHECKOUT_CANCEL_URL,
    portalReturnUrl: c.env.STRIPE_PORTAL_RETURN_URL,
    priceIds: {
      plusMonthly: c.env.STRIPE_PRICE_PLUS_MONTHLY,
      plusQuarterly: c.env.STRIPE_PRICE_PLUS_QUARTERLY,
      plusAnnual: c.env.STRIPE_PRICE_PLUS_ANNUAL,
    },
    logger: console,
  };
  return new BillingService(sql, config);
};

interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  emailNotificationsEnabledAt: string | null;
}

interface EmailNotificationsUpdateResponse {
  emailNotificationsEnabledAt: string | null;
}

interface ChangeEmailResponse {
  email: string | null;
  requiresConfirmation: boolean;
  message: string;
}

export const registerUserRoutes = (app: Hono<SeatingHonoEnv>): void => {
  app.get('/user/profile', async (c) => {
    const user = getUser(c);

    if (!user?.id) {
      throw new HttpError(401, 'Unauthorized');
    }

    const authService = createAuthServiceFor(
      {
        sqlFactory: (env) => createDb(env),
        createBetterAuthConfig: (env, requestOrigin) => ({
          secret: env.BETTER_AUTH_SECRET,
          baseUrl: requestOrigin,
          logger: console,
        }),
      },
      c.env,
      new URL(c.req.url).origin,
    );

    const profile = await authService.getProfile(user.id);

    if (!profile) {
      throw new HttpError(500, 'Failed to fetch user profile');
    }

    const responseBody: UserProfile = {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      emailNotificationsEnabledAt: profile.emailNotificationsEnabledAt,
    };

    return c.json(responseBody, 200);
  });

  app.post('/user/email-notifications', async (c) => {
    const user = getUser(c);

    if (!user?.id) {
      throw new HttpError(401, 'Unauthorized');
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }

    const parsed = EmailNotificationsUpdateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, issue?.message ?? 'Invalid request body');
    }

    const { enabled } = parsed.data;

    // Check if user has an active subscription
    const billingService = createBillingService(c);
    const subscriptionStatus = await billingService.getSubscriptionStatus(user.id);

    if (subscriptionStatus !== 'active') {
      throw new HttpError(403, 'Email notifications are only available to Plus subscribers');
    }

    const authService = createAuthServiceFor(
      {
        sqlFactory: (env) => createDb(env),
        createBetterAuthConfig: (env, requestOrigin) => ({
          secret: env.BETTER_AUTH_SECRET,
          baseUrl: requestOrigin,
          logger: console,
        }),
      },
      c.env,
      new URL(c.req.url).origin,
    );

    const emailNotificationsEnabledAt = await authService.updateProfileEmailNotifications(
      user.id,
      enabled,
    );

    const responseBody: EmailNotificationsUpdateResponse = {
      emailNotificationsEnabledAt,
    };

    return c.json(responseBody, 200);
  });

  app.put('/user/email', async (c) => {
    const user = getUser(c);

    if (!user?.id) {
      throw new HttpError(401, 'Unauthorized');
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }

    const parsed = ChangeEmailRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, issue?.message ?? 'Invalid request body');
    }

    const { newEmail } = parsed.data;

    const authService = createAuthServiceFor(
      {
        sqlFactory: (env) => createDb(env),
        createBetterAuthConfig: (env, requestOrigin) => ({
          secret: env.BETTER_AUTH_SECRET,
          baseUrl: requestOrigin,
          logger: console,
        }),
      },
      c.env,
      new URL(c.req.url).origin,
    );

    // Queue the email change; the account email updates on confirmation.
    const token = await authService.requestEmailChange({ userId: user.id, newEmail, headers: c.req.raw.headers });
    void token;

    const responseBody: ChangeEmailResponse = {
      email: newEmail,
      requiresConfirmation: true,
      message: 'Email updated successfully. Please check your new email for a confirmation link.',
    };

    return c.json(responseBody, 200);
  });

  app.delete('/user/account', async (c) => {
    const user = getUser(c);

    if (!user?.id) {
      throw new HttpError(401, 'Unauthorized');
    }

    const authService = createAuthServiceFor(
      {
        sqlFactory: (env) => createDb(env),
        createBetterAuthConfig: (env, requestOrigin) => ({
          secret: env.BETTER_AUTH_SECRET,
          baseUrl: requestOrigin,
          logger: console,
        }),
      },
      c.env,
      new URL(c.req.url).origin,
    );

    // Check if user is already soft-deleted
    const existingProfile = await authService.getProfile(user.id);

    if (!existingProfile) {
      throw new HttpError(500, 'Failed to fetch user profile');
    }

    if (existingProfile.deleted_at) {
      throw new HttpError(400, 'Account is already deleted');
    }

    // Check if user has an active subscription and cancel it
    const billingService = createBillingService(c);
    const subscription = await billingService.getSubscription(user.id);

    if (subscription.subscription?.stripe_subscription_id && subscription.status === 'active') {
      try {
        await billingService.cancelSubscription(user.id);
        console.log('[DELETE /user/account] Cancelled Stripe subscription for user:', user.id);
      } catch (error) {
        console.error('[DELETE /user/account] Failed to cancel Stripe subscription:', error);
        // Don't fail the deletion, but log the error
      }
    }
    // Soft delete by setting deleted_at timestamp and revoking sessions. This
    // immediately disables access (api-routes-review.md §3.1): a repeated
    // request after this point has no valid session and 401s, which is what
    // makes account deletion intentionally not teacher-replayable.
    try {
      await authService.softDeleteProfile(user.id);
    } catch (error) {
      console.error('[DELETE /user/account] Failed to soft-delete:', error);
      throw new HttpError(500, 'Failed to delete account');
    }

    // Schedule Assignment Reader's cross-store (Postgres + R2) cleanup
    // (TASK-018). Access and sessions are already revoked above; this only
    // enumerates and hands off Assignment Reader data to the durable
    // deletion pipeline apps/assignment-worker/src/deletion owns.
    const assignmentReaderService = createAssignmentReaderServiceForDeletion(c);
    const { operation } = await assignmentReaderService.scheduleAccountDeletion(user.id);

    const responseBody: { data: DeletionOperation } = { data: operation };

    return c.json(responseBody, 202);
  });
};

const EmailNotificationsUpdateRequestSchema = z.object({
  enabled: z.boolean(),
});

const ChangeEmailRequestSchema = z.object({
  newEmail: z.string().email('Invalid email address'),
});
