import { betterAuth } from 'better-auth';
import { PostgresJSDialect } from 'kysely-postgres-js';
import type { Sql } from '../../db/sql';

export interface BetterAuthConfig {
  secret: string;
  frontendUrl: string;
  allowedOrigins?: string[];
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
    baseURL: config.frontendUrl,
    trustedOrigins: config.allowedOrigins,
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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    emailVerification: config.sendVerificationEmail
      ? {
          sendVerificationEmail: async ({ user, url, token }) => {
            config.sendVerificationEmail?.({ user: { email: user.email }, url, token });
          },
        }
      : undefined,
    user: {
      additionalFields: {
        displayName: {
          type: 'string',
          required: false,
          returned: true,
        },
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;
