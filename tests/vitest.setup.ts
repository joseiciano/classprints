import { vi } from 'vitest';
import type * as AuthModule from '@classprints/server/auth';

vi.mock('@hono-rate-limiter/cloudflare', () => ({
  cloudflareRateLimiter: () => (_context: unknown, next: () => unknown) => next(),
}));

vi.mock('@classprints/server/auth', async () => {
  const actual = await vi.importActual<typeof AuthModule>('@classprints/server/auth');

  return {
    ...actual,
    authenticateRequest: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
    }),
    optionalAuthenticateRequest: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
    }),
    requireAuth:
      () =>
      async (
        context: { set: (key: string, value: unknown) => void },
        next: () => Promise<void>,
      ) => {
        context.set('user', { id: 'test-user-id', email: 'test@example.com' });
        await next();
      },
    optionalAuth:
      () =>
      async (
        context: { set: (key: string, value: unknown) => void },
        next: () => Promise<void>,
      ) => {
        context.set('userOptional', { id: 'test-user-id', email: 'test@example.com' });
        await next();
      },
  };
});
