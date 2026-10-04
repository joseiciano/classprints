import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/index';

vi.mock('../src/lib/db', () => ({ createDb: () => vi.fn() }));

const createEnv = (environment: string) =>
  ({
    ENVIRONMENT: environment,
    APPLICATION_NAME: 'Seating API',
    FRONTEND_URL: 'http://localhost:5173',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-1234',
    HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/db' },
  }) as never;

describe('API docs', () => {
  const app = buildApp();

  it('serves the OpenAPI document outside production', async () => {
    const res = await app.fetch(new Request('http://localhost/openapi.json'), createEnv('staging'));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.paths).toHaveProperty('/api/v1/user/profile');
    expect(doc.paths).toHaveProperty('/api/v1/user/account');
    expect(doc.components.securitySchemes).toHaveProperty('cookieAuth');
    expect(doc.components.securitySchemes).toHaveProperty('csrfToken');
    // Better Auth's native endpoints are merged under their mount path.
    expect(Object.keys(doc.paths).some((p) => p.startsWith('/api/v1/auth/better-auth/'))).toBe(true);
  });

  it('serves the Swagger UI outside production', async () => {
    const res = await app.fetch(new Request('http://localhost/docs'), createEnv('staging'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it.each(['/openapi.json', '/docs'])('returns 404 for %s in production', async (path) => {
    const res = await app.fetch(new Request(`http://localhost${path}`), createEnv('production'));
    expect(res.status).toBe(404);
  });
});
