import { afterEach, describe, expect, it, vi } from 'vitest';

// The product name and support address are chosen per deployment via Vite
// env vars (Bellvel by default; staging opts into ClassPrints).
const loadConstants = async () => {
  vi.resetModules();
  return import('../src/lib/constants');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each([
  { constant: 'APPLICATION_NAME', envVar: 'VITE_APP_NAME', configured: 'ClassPrints' },
  { constant: 'SUPPORT_EMAIL', envVar: 'VITE_SUPPORT_EMAIL', configured: 'MyClassPrints@gmail.com' },
] as const)('$constant', ({ constant, envVar, configured }) => {
  it(`uses ${envVar} when the deployment sets it`, async () => {
    vi.stubEnv(envVar, configured);

    const constants = await loadConstants();

    expect(constants[constant]).toBe(configured);
  });

  // An empty value (e.g. `VITE_APP_NAME=` left blank in an .env file) must be
  // treated as unset rather than rendering a blank brand.
  it(`treats an empty ${envVar} the same as an unset one`, async () => {
    vi.stubEnv(envVar, undefined);
    const whenUnset = (await loadConstants())[constant];

    vi.stubEnv(envVar, '');
    const whenEmpty = (await loadConstants())[constant];

    expect(whenEmpty).toBe(whenUnset);
    expect(whenEmpty).not.toBe('');
  });
});
