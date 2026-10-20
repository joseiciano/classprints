import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { SeatingHonoEnv } from '../types/env';
import { HttpError } from '../lib/http-error';
import {
  authErrorResponses,
  csrfErrorResponses,
  ErrorResponseSchema,
  jsonContent,
  mutatingSecurity,
  sessionSecurity,
} from '../openapi/schemas';
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

const UserProfileSchema = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
    displayName: z.string().nullable(),
    emailNotificationsEnabledAt: z.string().nullable(),
  })
  .openapi('UserProfile');

const EmailNotificationsUpdateRequestSchema = z
  .object({ enabled: z.boolean() })
  .openapi('EmailNotificationsUpdateRequest');

const EmailNotificationsUpdateResponseSchema = z
  .object({ emailNotificationsEnabledAt: z.string().nullable() })
  .openapi('EmailNotificationsUpdateResponse');

const ChangeEmailRequestSchema = z
  .object({ newEmail: z.string().email('Invalid email address') })
  .openapi('ChangeEmailRequest');

const ChangeEmailResponseSchema = z
  .object({
    email: z.string().nullable(),
    requiresConfirmation: z.boolean(),
    message: z.string(),
  })
  .openapi('ChangeEmailResponse');

const DeleteAccountResponseSchema = z
  .object({
    data: z.object({
      id: z.string().uuid(),
      targetType: z.enum(['page', 'materials', 'submission', 'student_data', 'assignment', 'class', 'account']),
      targetId: z.string().uuid(),
      status: z.literal('pending'),
      acceptedAt: z.string().datetime(),
    }),
  })
  .openapi('DeleteAccountResponse');

const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  required: true,
  content: { 'application/json': { schema } },
});

const getProfileRoute = createRoute({
  method: 'get',
  path: '/user/profile',
  tags: ['User'],
  summary: 'Get the signed-in user profile',
  security: sessionSecurity,
  responses: {
    200: jsonContent(UserProfileSchema, 'The current user profile'),
    ...authErrorResponses,
    500: jsonContent(ErrorResponseSchema, 'Profile could not be loaded'),
  },
});

const updateEmailNotificationsRoute = createRoute({
  method: 'post',
  path: '/user/email-notifications',
  tags: ['User'],
  summary: 'Enable or disable email notifications (Plus only)',
  security: mutatingSecurity,
  request: { body: jsonBody(EmailNotificationsUpdateRequestSchema) },
  responses: {
    200: jsonContent(EmailNotificationsUpdateResponseSchema, 'Updated notification state'),
    400: jsonContent(ErrorResponseSchema, 'Invalid request body'),
    ...authErrorResponses,
    403: jsonContent(ErrorResponseSchema, 'Requires an active Plus subscription, or CSRF token missing'),
  },
});

const changeEmailRoute = createRoute({
  method: 'put',
  path: '/user/email',
  tags: ['User'],
  summary: 'Request an email address change',
  description: 'The account email updates once the new address is confirmed.',
  security: mutatingSecurity,
  request: { body: jsonBody(ChangeEmailRequestSchema) },
  responses: {
    200: jsonContent(ChangeEmailResponseSchema, 'Change queued; confirmation email sent'),
    400: jsonContent(ErrorResponseSchema, 'Invalid request body'),
    ...authErrorResponses,
    ...csrfErrorResponses,
  },
});

const deleteAccountRoute = createRoute({
  method: 'delete',
  path: '/user/account',
  tags: ['User'],
  summary: 'Soft-delete the account',
  description:
    'Cancels an active subscription, schedules Assignment Reader data cleanup, soft-deletes the profile and revokes sessions.',
  security: mutatingSecurity,
  responses: {
    202: jsonContent(DeleteAccountResponseSchema, 'Account deletion accepted; cleanup runs asynchronously'),
    400: jsonContent(ErrorResponseSchema, 'Account is already deleted'),
    ...authErrorResponses,
    ...csrfErrorResponses,
    500: jsonContent(ErrorResponseSchema, 'Account could not be deleted'),
  },
});

export const registerUserRoutes = (app: OpenAPIHono<SeatingHonoEnv>): void => {
  app.openapi(getProfileRoute, async (c) => {
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

    const responseBody = {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      emailNotificationsEnabledAt: profile.emailNotificationsEnabledAt,
    };

    return c.json(responseBody, 200);
  });

  app.openapi(updateEmailNotificationsRoute, async (c) => {
    const user = getUser(c);

    if (!user?.id) {
      throw new HttpError(401, 'Unauthorized');
    }

    const { enabled } = c.req.valid('json');

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

    const responseBody = {
      emailNotificationsEnabledAt,
    };

    return c.json(responseBody, 200);
  });

  app.openapi(changeEmailRoute, async (c) => {
    const user = getUser(c);

    if (!user?.id) {
      throw new HttpError(401, 'Unauthorized');
    }

    const { newEmail } = c.req.valid('json');

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

    const responseBody = {
      email: newEmail,
      requiresConfirmation: true,
      message: 'Email updated successfully. Please check your new email for a confirmation link.',
    };

    return c.json(responseBody, 200);
  });

  app.openapi(deleteAccountRoute, async (c) => {
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

    // Schedule Assignment Reader's cross-store (Postgres + R2) cleanup
    // (TASK-018) BEFORE the irreversible soft-delete below. Nothing
    // irreversible has happened yet at this point (the `deleted_at` gate
    // above hasn't tripped, and the billing cancellation above is already
    // tolerant of being retried), so if this enumeration/handoff throws
    // (e.g. a transient DB error locking the teacher's material versions and
    // submissions in createScopeDeletionOperation), the request safely 500s
    // and the client can just retry the same request - exactly like
    // deleteClass/deleteAssignment/deleteMaterials/deleteSubmission/
    // deleteStudentData. Doing this after softDeleteProfile instead would
    // leave the account permanently soft-deleted (and the route's own
    // `deleted_at` gate above would then 400 any retry) with no
    // deletion_operations row ever created - the exact gap this ordering
    // avoids.
    const assignmentReaderService = createAssignmentReaderServiceForDeletion(c);
    const { operation } = await assignmentReaderService.scheduleAccountDeletion(user.id);

    // Soft delete by setting deleted_at timestamp and revoking sessions. This
    // immediately disables access (api-routes-review.md §3.1): a repeated
    // request after this point has no valid session and 401s, which is what
    // makes account deletion intentionally not teacher-replayable through
    // this route once it succeeds. (A retry after a failure here still
    // works: scheduleAccountDeletion above is idempotent via
    // findPendingDeletionOperation, so it just returns the existing pending
    // operation instead of creating a second one.)
    try {
      await authService.softDeleteProfile(user.id);
    } catch (error) {
      console.error('[DELETE /user/account] Failed to soft-delete:', error);
      throw new HttpError(500, 'Failed to delete account');
    }

    const responseBody: { data: DeletionOperation } = { data: operation };

    return c.json(responseBody, 202);
  });
};
