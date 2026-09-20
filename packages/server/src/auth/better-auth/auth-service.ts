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
  // Structural match instead of `instanceof APIError`: Better Auth's error
  // class arrives via two package copies, so instanceof fails in the bundle.
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new HttpError(error.status, error.message);
  }
  return new HttpError(500, 'Authentication service error');
};

/** With `asResponse: true`, Better Auth reports failures as a non-ok Response
 * rather than a thrown error; translate it so routes keep their status codes. */
const throwIfFailed = async (response: Response): Promise<Response> => {
  if (response.ok) {
    return response;
  }
  let message = 'Authentication request failed';
  try {
    const payload = (await response.json()) as { message?: string; code?: string };
    message = payload.message ?? payload.code ?? message;
  } catch {
    // Keep the default message for non-JSON error bodies.
  }
  throw new HttpError(response.status, message);
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
  /** Raw Better Auth response; callers must forward its Set-Cookie headers.
   * `callbackUrl` is where the verification-email link redirects after the
   * user verifies (must be a trusted origin). */
  async signUpEmail(input: {
    email: string;
    password: string;
    name: string;
    displayName?: string;
    callbackUrl?: string;
    headers?: Headers;
  }): Promise<Response> {
    try {
      return await throwIfFailed(
        await this.auth.api.signUpEmail({
          body: {
            email: input.email,
            password: input.password,
            name: input.name,
            displayName: input.displayName,
            callbackURL: input.callbackUrl,
          },
          headers: input.headers,
          asResponse: true,
        }),
      );
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** Raw Better Auth response; callers must forward its Set-Cookie headers. */
  async signInEmail(input: {
    email: string;
    password: string;
    remember?: boolean;
    headers?: Headers;
  }): Promise<Response> {
    try {
      return await throwIfFailed(
        await this.auth.api.signInEmail({
          body: {
            email: input.email,
            password: input.password,
            rememberMe: input.remember ?? true,
          },
          headers: input.headers,
          asResponse: true,
        }),
      );
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** Raw Better Auth response; callers must forward its Set-Cookie headers. */
  async signOut(headers: Headers): Promise<Response> {
    try {
      return await this.auth.api.signOut({ headers, asResponse: true });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async getSession(
    headers: Headers,
  ): Promise<{
    user: { id: string; email: string | null; displayName: string | null; emailVerified: boolean };
  } | null> {
    try {
      const session = await this.auth.api.getSession({ headers });
      if (!session) {
        return null;
      }
      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          displayName: session.user.displayName ?? null,
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

  async resendVerificationEmail(email: string, callbackUrl = '/'): Promise<void> {
    try {
      await this.auth.api.sendVerificationEmail({ body: { email, callbackURL: callbackUrl } });
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

  async updateProfileEmailNotifications(userId: string, enabled: boolean): Promise<string | null> {
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
