import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/index';

// Mock postgres.js client used by user routes
const mockSql = vi.fn();

vi.mock('../src/lib/db', () => ({
  createDb: () => mockSql,
}));

// Mock auth service used by user routes
const mockAuthService = {
  getProfile: vi.fn(),
  updateProfileEmailNotifications: vi.fn(),
  requestEmailChange: vi.fn(),
  softDeleteProfile: vi.fn(),
};

vi.mock('@classprints/server/auth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createAuthServiceFor: vi.fn(() => mockAuthService),
    requireAuth: vi.fn(() =>
      vi.fn(async (c: any, next: any) => {
        const authHeader = c.req.header('Authorization');
        if (!authHeader || authHeader.includes('invalid')) {
          const { HttpError } = await import('../src/lib/http-error');
          throw new HttpError(401, 'Invalid or expired access token');
        }
        c.set('user', { id: 'test-user-id', email: 'test@example.com' });
        await next();
      }),
    ),
  };
});

// Mock BillingService and billing routes
vi.mock('@classprints/server/billing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    BillingService: class MockBillingService {
      getSubscription = vi.fn().mockResolvedValue({ tier: 'plus', status: 'active', subscription: null });
      getSubscriptionStatus = vi.fn().mockResolvedValue('active');
      cancelSubscription = vi.fn().mockResolvedValue(undefined);
    },
    registerBillingRoutes: vi.fn(),
  };
});

describe('User Routes', () => {
  const app = buildApp();

  const createEnv = () => ({
    ENVIRONMENT: 'test',
    APPLICATION_NAME: 'Seating Backend',
    FRONTEND_URL: 'http://localhost:5173',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/db' } as never,
    STRIPE_SECRET_KEY: 'sk_test_mock',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DELETE /api/v1/user/account', () => {
    it('should soft-delete user account successfully', async () => {
      mockAuthService.getProfile.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com',
        display_name: 'Test User',
        email_notifications_enabled_at: null,
        deleted_at: null,
      });
      mockAuthService.softDeleteProfile.mockResolvedValue('2026-03-06T10:00:00.000Z');

      const req = new Request('http://localhost/api/v1/user/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      });

      const res = await app.fetch(req, createEnv() as any);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.message).toBe('Account has been soft-deleted successfully');
      expect(data.deletedAt).toBeDefined();
    });

    it('should return 400 if account is already deleted', async () => {
      mockAuthService.getProfile.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com',
        display_name: 'Test User',
        email_notifications_enabled_at: null,
        deleted_at: '2026-03-05T10:00:00.000Z',
      });

      const req = new Request('http://localhost/api/v1/user/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      });

      const res = await app.fetch(req, createEnv() as any);

      expect(res.status).toBe(400);
      const data = await res.json();

      expect(data.error).toBe('Account is already deleted');
    });

    it('should return 500 if fetching profile fails', async () => {
      mockAuthService.getProfile.mockResolvedValue(null);

      const req = new Request('http://localhost/api/v1/user/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      });

      const res = await app.fetch(req, createEnv() as any);

      expect(res.status).toBe(500);
      const data = await res.json();

      expect(data.error).toBe('Failed to fetch user profile');
    });

    it('should return 500 if update fails', async () => {
      mockAuthService.getProfile.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com',
        display_name: 'Test User',
        email_notifications_enabled_at: null,
        deleted_at: null,
      });
      mockAuthService.softDeleteProfile.mockRejectedValue(new Error('Update failed'));

      const req = new Request('http://localhost/api/v1/user/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      });

      const res = await app.fetch(req, createEnv() as any);

      expect(res.status).toBe(500);
      const data = await res.json();

      expect(data.error).toBe('Failed to delete account');
    });

    it('should return 401 if user is not authenticated', async () => {
      const req = new Request('http://localhost/api/v1/user/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
      });

      const res = await app.fetch(req, createEnv() as any);

      expect(res.status).toBe(401);
    });
  });
});
