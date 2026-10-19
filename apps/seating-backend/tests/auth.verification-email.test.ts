import { describe, expect, it, vi } from 'vitest';
import type * as AuthModule from '@classprints/server/auth';
import type { AuthDeps } from '@classprints/server/auth';
import type { SeatingWorkerBindings } from '../src/types/env';

// The verification-email hook is built inside `buildApp` and handed to
// `registerAuthController`; capture those deps so the real hook can be driven
// without a database-backed sign-up.
const captured = vi.hoisted(() => ({ deps: [] as unknown[] }));

vi.mock('@classprints/server/auth', async () => {
  const actual = await vi.importActual<typeof AuthModule>('@classprints/server/auth');
  return {
    ...actual,
    registerAuthController: ((app, deps, rateLimit) => {
      captured.deps.push(deps);
      return actual.registerAuthController(app, deps, rateLimit);
    }) as typeof actual.registerAuthController,
  };
});

const { buildApp } = await import('../src/index');

type SentMessage = {
  from: { email: string; name: string };
  to: string;
  subject: string;
  html: string;
  text: string;
};

class InMemorySendEmailBinding {
  readonly sent: SentMessage[] = [];

  async send(message: SentMessage): Promise<void> {
    this.sent.push(message);
  }
}

const verificationUrl =
  'https://api.example.test/api/v1/auth/better-auth/verify-email?token=tok&callbackURL=%2F';

const sendVerificationEmailWith = async (
  appDisplayName: string | undefined,
): Promise<SentMessage[]> => {
  captured.deps.length = 0;
  buildApp();
  const deps = captured.deps.at(-1) as AuthDeps<SeatingWorkerBindings>;

  const binding = new InMemorySendEmailBinding();
  const env = {
    ENVIRONMENT: 'test',
    FRONTEND_URL: 'https://web.example.test',
    ALLOWED_ORIGINS: 'https://web.example.test',
    BETTER_AUTH_SECRET: 'test-secret-value-at-least-32-characters',
    EMAIL: binding,
    EMAIL_FROM_ADDRESS: 'noreply@example.test',
    EMAIL_FROM_NAME: 'Sender',
    ...(appDisplayName === undefined ? {} : { APP_DISPLAY_NAME: appDisplayName }),
  } as unknown as SeatingWorkerBindings;

  const pending: Promise<unknown>[] = [];
  const config = deps.createBetterAuthConfig(env, 'https://api.example.test', (promise) => {
    pending.push(promise);
  });
  config.sendVerificationEmail?.({
    user: { email: 'teacher@example.test' },
    url: verificationUrl,
    token: 'tok',
  });
  await Promise.all(pending);

  return binding.sent;
};

describe('seating-backend verification email branding', () => {
  it('brands subject, text and html with APP_DISPLAY_NAME', async () => {
    const sent = await sendVerificationEmailWith('Bellvel');

    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message?.to).toBe('teacher@example.test');
    expect(message?.subject).toBe('Verify Your Email - Bellvel');
    expect(message?.text).toBe(`Verify your Bellvel email address: ${verificationUrl}`);
    expect(message?.html).toContain('<title>Verify Your Email - Bellvel</title>');
    expect(message?.html).toContain(`href="${verificationUrl}"`);
    expect(JSON.stringify(message)).not.toContain('ClassPrints');
  });

  // A blank APP_DISPLAY_NAME (e.g. an empty wrangler var) must not produce
  // "Verify Your Email - " — it behaves exactly like an unset one.
  it('treats an empty APP_DISPLAY_NAME the same as an unset one', async () => {
    const [whenUnset] = await sendVerificationEmailWith(undefined);
    const [whenEmpty] = await sendVerificationEmailWith('');

    expect(whenEmpty).toBeDefined();
    expect(whenEmpty?.subject).toBe(whenUnset?.subject);
    expect(whenEmpty?.text).toBe(whenUnset?.text);
    expect(whenEmpty?.html).toBe(whenUnset?.html);
    expect(whenEmpty?.subject).not.toMatch(/- $|undefined/);
  });
});
