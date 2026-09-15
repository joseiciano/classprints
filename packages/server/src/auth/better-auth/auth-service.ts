import { APIError } from 'better-auth/api';
import { HttpError } from '../../http';
import type { Sql } from '../../db/sql';
import type { Auth } from './auth';
export interface AuthUserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  emailNotificationsEnabledAt: string | null;
  deleted_at: string | null;
}

const toHttpError = (error: unknown): HttpError => {
  if (error instanceof APIError) {
    return new HttpError(error.status as 400, error.message);
  }
  return new HttpError(500, 'Authentication service error');
};

/**
 * Backend-facing wrapper around Better Auth server APIs. All auth logic lives
 * on the backend; the frontend only ever calls these backend HTTP endpoints.
 */
export class AuthService {
  constructor(
    private readonly auth: Auth,
    private readonly sql: Sql,
  ) {}
  async signUpEmail(input: {
    email: string;
    password: string;
    name: string;
    displayName?: string;
    headers?: Headers;
  }): Promise<void> {
    try {
      await this.auth.api.signUpEmail({
        body: {
          email: input.email,
          password: input.password,
          name: input.name,
          displayName: input.displayName,
        },
        headers: input.headers,
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async signInEmail(input: {
    email: string;
    password: string;
    remember?: boolean;
    headers?: Headers;
  }): Promise<void> {
    try {
      await this.auth.api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
          rememberMe: input.remember ?? true,
        },
        headers: input.headers,
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async signOut(headers: Headers): Promise<void> {
    try {
      await this.auth.api.signOut({ headers });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async getSession(
    headers: Headers,
  ): Promise<{ user: { id: string; email: string | null; displayName: string | null; emailVerified: boolean } } | null> {
    try {
      const session = await this.auth.api.getSession({ headers });
      if (!session) {
        return null;
      }
      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          displayName: (session.user as { displayName?: string | null }).displayName ?? null,
          emailVerified: session.user.emailVerified,
        },
      };
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async requestEmailChange(input: {
    userId: string;
    newEmail: string;
    headers: Headers;
  }): Promise<void> {
    try {
      await this.auth.api.changeEmail({
        body: { newEmail: input.newEmail },
        headers: input.headers,
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async resendVerificationEmail(email: string): Promise<void> {
    try {
      await this.auth.api.sendVerificationEmail({ body: { email, callbackURL: '/' } });
    } catch (error) {
      throw toHttpError(error);
    }
  }
  async getProfile(userId: string): Promise<AuthUserProfile | null> {
    const rows = await this.sql`
      select u.id, u.email, u.name, u.email_verified,
             p.email_notifications_enabled_at, p.deleted_at
      from "user" u
      left join user_profiles p on p.id = u.id
      where u.id = ${userId}
      limit 1
    `;
    const row = rows[0] as
      | {
          id: string;
          email: string;
          name: string | null;
          email_verified: boolean;
          email_notifications_enabled_at: Date | string | null;
          deleted_at: Date | string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    const toIso = (value: Date | string | null): string | null => {
      if (value === null || value === undefined) {
        return null;
      }
      return value instanceof Date ? value.toISOString() : String(value);
    };

    return {
      id: row.id,
      email: row.email,
      displayName: row.name,
      emailNotificationsEnabledAt: toIso(row.email_notifications_enabled_at),
      deleted_at: toIso(row.deleted_at),
    };
  }

  async updateProfileEmailNotifications(
    userId: string,
    enabled: boolean,
  ): Promise<string | null> {
    const value = enabled ? new Date().toISOString() : null;
    const rows = await this.sql`
      update user_profiles
      set email_notifications_enabled_at = ${value}, updated_at = now()
      where id = ${userId}
      returning email_notifications_enabled_at
    `;
    const row = rows[0] as { email_notifications_enabled_at: Date | string | null } | undefined;
    if (!row) {
      return null;
    }
    const raw = row.email_notifications_enabled_at;
    if (raw === null || raw === undefined) {
      return null;
    }
    return raw instanceof Date ? raw.toISOString() : String(raw);
  }

  async softDeleteProfile(userId: string): Promise<string> {
    const deletedAt = new Date().toISOString();
    await this.sql`
      update user_profiles set deleted_at = ${deletedAt}, updated_at = now()
      where id = ${userId}
    `;
    await this.sql`
      update session set expires_at = now() where user_id = ${userId}
    `;
    return deletedAt;
  }
}
