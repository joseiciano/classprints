import { describe, expect, it } from 'vitest';
import { renderVerificationTemplate as renderEmailTemplate } from '@classprints/server/email';
import { renderVerificationTemplate as renderBetterAuthTemplate } from '@classprints/server/auth/better-auth/verification-template';

const titleOf = (html: string): string | undefined => /<title>(.*?)<\/title>/s.exec(html)?.[1];
const hrefsOf = (html: string): string[] =>
  [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? '');

// Two identical copies exist; the product name now varies by environment, so
// each copy must brand the email with the caller-supplied name only.
describe.each([
  { copy: 'email', render: renderEmailTemplate },
  { copy: 'better-auth', render: renderBetterAuthTemplate },
])('renderVerificationTemplate ($copy copy)', ({ render }) => {
  const verificationLink =
    'https://api.example.test/api/v1/auth/better-auth/verify-email?token=abc.def&callbackURL=%2F';

  it.each([
    { appName: 'Bellvel', otherBrand: 'ClassPrints' },
    { appName: 'ClassPrints', otherBrand: 'Bellvel' },
  ])('brands title and body as $appName without mentioning $otherBrand', ({ appName, otherBrand }) => {
    const html = render({ verificationLink, appName });

    expect(titleOf(html)).toBe(`Verify Your Email - ${appName}`);
    expect(html).toContain(`Thank you for signing up for ${appName}!`);
    expect(html).not.toContain(otherBrand);
  });

  it('links to the exact verification URL', () => {
    const html = render({ verificationLink, appName: 'Bellvel' });

    expect(hrefsOf(html)).toEqual([verificationLink]);
  });
});
