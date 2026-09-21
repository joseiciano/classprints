import { describe, expect, it } from 'vitest';
import { createAuth } from '@classprints/server/auth/better-auth/auth';

// Email verification links are built as `${baseURL}${basePath}/verify-email`.
// The backend mounts the Better Auth handler at
// `/api/v1/auth/better-auth/*`, so the basePath handed to Better Auth MUST be
// that full mount path — otherwise links point at an unrouted 404 and the
// verification token is never consumed.
describe('Better Auth basePath wiring', () => {
  it('uses the caller-provided mount path for link generation and routing', () => {
    const auth = createAuth({} as never, {
      secret: 'test-secret-value-at-least-32-characters',
      baseUrl: 'https://api.example.test',
      basePath: '/api/v1/auth/better-auth',
    });

    expect(auth.options.basePath).toBe('/api/v1/auth/better-auth');
  });

  it('exposes caller-provided trusted origins so frontend callback URLs are accepted', () => {
    const auth = createAuth({} as never, {
      secret: 'test-secret-value-at-least-32-characters',
      baseUrl: 'https://api.example.test',
      trustedOrigins: ['https://web.example.test'],
    });

    expect(auth.options.trustedOrigins).toEqual(['https://web.example.test']);
  });

  it('enables automatic sign-in after email verification', () => {
    const auth = createAuth({} as never, {
      secret: 'test-secret-value-at-least-32-characters',
      baseUrl: 'https://api.example.test',
      sendVerificationEmail: () => {},
    });

    expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(true);
  });
});
