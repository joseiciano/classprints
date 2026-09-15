import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/index';

describe('Seating Backend API', () => {
  const app = buildApp();

  it('should return health status', async () => {
    const req = new Request('http://localhost/health');
    const res = await app.fetch(req, {
      ENVIRONMENT: 'test',
      APPLICATION_NAME: 'Seating API',
      FRONTEND_URL: 'http://localhost:5173',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/db' } as never,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('service');
    expect(data).toHaveProperty('timestamp');
  });

  it('should return metadata', async () => {
    const req = new Request('http://localhost/api/v1/metadata');
    const res = await app.fetch(req, {
      ENVIRONMENT: 'test',
      APPLICATION_NAME: 'Seating API',
      FRONTEND_URL: 'http://localhost:5173',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/db' } as never,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('name', 'seating-backend');
    expect(data).toHaveProperty('version', '0.1.0');
  });
});
