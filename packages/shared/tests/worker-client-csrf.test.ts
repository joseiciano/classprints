import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureAuthSession } from '../src/auth/config';
import { callWorkerEndpoint } from '../src/http/worker-client';

const TOKEN = '957e419f-670a-4356-8655-b6e3e3b7a321';

describe('callWorkerEndpoint CSRF header', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    configureAuthSession({ csrfCookie: 'seating_csrf_token' });
    vi.stubGlobal('document', { cookie: `other=1; seating_csrf_token=${TOKEN}` });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sentHeaders = () => fetchMock.mock.calls[0][1].headers as Record<string, string>;

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('sends X-CSRF-Token on %s', async (method) => {
    await callWorkerEndpoint('/api/v1/classes', { baseUrl: 'http://x', method, body: {} });
    expect(sentHeaders()['X-CSRF-Token']).toBe(TOKEN);
  });

  it('does not send the header on GET', async () => {
    await callWorkerEndpoint('/api/v1/classes', { baseUrl: 'http://x', method: 'GET' });
    expect(sentHeaders()['X-CSRF-Token']).toBeUndefined();
  });

  it('omits the header when the cookie is absent', async () => {
    vi.stubGlobal('document', { cookie: '' });
    await callWorkerEndpoint('/api/v1/classes', { baseUrl: 'http://x', method: 'POST', body: {} });
    expect(sentHeaders()['X-CSRF-Token']).toBeUndefined();
  });
});
