import { betterAuth } from 'better-auth';
import { PostgresJSDialect } from 'kysely-postgres-js';
import type { Sql } from '../../db/sql';

export interface BetterAuthConfig {
  secret: string;
  /** This API's own origin; verification links and cookies are built from it. */
  baseUrl: string;
  /**
   * Full mount path of the Better Auth handler (e.g. `/api/v1/auth/better-auth`).
   * Verification and reset links are built from `${baseUrl}${basePath}`, so this
   * must match the route the handler is actually served under.
   */
  basePath?: string;
  /** Extra origins trusted for callbackURL redirects (e.g. the frontend). */
  trustedOrigins?: string[];
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  /** Sends the verification email; required when email verification is enabled. */
  sendVerificationEmail?: (input: { user: { email: string }; url: string; token: string }) => void;
  fromEmail?: string;
}

/**
 * Creates the Better Auth instance for this request. Built per-request because
 * the Neon connection is only reachable through the per-request Hyperdrive binding.
 */
export const createAuth = (sql: Sql, config: BetterAuthConfig) =>
  betterAuth({
    secret: config.secret,
    // The API's own origin, resolved per request by the caller: links for
    // email verification and password resets must point at the Better Auth
    // handler mount below, not the frontend.
    baseURL: config.baseUrl,
    basePath: config.basePath ?? '/auth/better-auth',
    trustedOrigins: config.trustedOrigins,
    logger: {
      level: 'warn',
      log: (level, message) => {
        if (level === 'error') config.logger?.error?.(message);
        else if (level === 'warn') config.logger?.warn?.(message);
        else config.logger?.log?.(message);
      },
    },
    database: {
      dialect: new PostgresJSDialect({ postgres: sql }),
      type: 'postgres',
    },
    // postgres.js runs with Hyperdrive, whose queries must avoid prepared
    // statements; runtime schema validation would additionally re-run the
    // Kysely introspection on every auth instance (built per request). The
    // schema is applied by database/migrations instead.
    advanced: {
      database: {
        generateId: 'uuid',
        validateSchema: false,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    emailVerification: config.sendVerificationEmail
      ? {
          sendVerificationEmail: async ({ user, url, token }) => {
            config.sendVerificationEmail?.({ user: { email: user.email }, url, token });
          },
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
        }
      : undefined,
    user: {
      // The public.users table is the app's identity source (jobs.user_id and
      // user_profiles.id reference it), so Better Auth's user model maps onto
      // it. Columns added by database/migrations 20260919000000.
      modelName: 'users',
      fields: {
        name: 'name',
        emailVerified: 'email_verified',
        image: 'image',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      additionalFields: {
        displayName: {
          type: 'string',
          required: false,
          returned: true,
          fieldName: 'display_name',
        },
      },
    },
    session: {
      // Reuses the existing auth_sessions table (recreated by the same
      // migration with Better Auth's session shape).
      modelName: 'auth_sessions',
      fields: {
        userId: 'user_id',
        token: 'token',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The app's profile endpoints read user_profiles; keep a row in
          // step with every created user.
          after: async (user) => {
            await sql`
              insert into user_profiles (id, email, display_name)
              values (${user.id}, ${user.email}, ${user.displayName ?? null})
              on conflict (id) do nothing
            `;
          },
        },
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;
