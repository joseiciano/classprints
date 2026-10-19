import { describe, expect, it } from 'vitest';

import worker, { type FrontendWorkerEnv } from '../worker/index';

// Fake service bindings: each answers with its own marker body and records the
// URLs it was asked to serve, so a test can tell which binding (if any)
// handled a request.
const makeEnv = () => {
  const assetsUrls: string[] = [];
  const apiUrls: string[] = [];
  const env: FrontendWorkerEnv = {
    ASSETS: {
      fetch: async (req) => {
        assetsUrls.push(req.url);
        return new Response('from-assets');
      },
    },
    API: {
      fetch: async (req) => {
        apiUrls.push(req.url);
        return new Response('from-api');
      },
    },
  };
  return { env, assetsUrls, apiUrls };
};

describe('frontend asset worker', () => {
  it('forwards /api/* to the API binding', async () => {
    const { env, assetsUrls, apiUrls } = makeEnv();
    const url = 'https://bellvel.com/api/auth/session?a=1';

    const response = await worker.fetch(new Request(url), env);

    expect(await response.text()).toBe('from-api');
    expect(apiUrls).toEqual([url]);
    expect(assetsUrls).toEqual([]);
  });

  it('serves other paths from static assets', async () => {
    const { env, assetsUrls, apiUrls } = makeEnv();
    const url = 'https://bellvel.com/settings?x=1';

    const response = await worker.fetch(new Request(url), env);

    expect(await response.text()).toBe('from-assets');
    expect(assetsUrls).toEqual([url]);
    expect(apiUrls).toEqual([]);
  });
});
