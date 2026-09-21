import { describe, expect, it } from 'vitest';
import type { Sql } from '@classprints/server/db';
import { checkEmailDeliveryEligibility } from '../src/db/queries';

/**
 * Fake `sql` tagged-template dispatching on the query text. Each query in
 * checkEmailDeliveryEligibility targets a distinct table ("user",
 * "subscriptions", "user_profiles"); anything else rejects loudly.
 */
const makeFakeSql = (tables: {
  user?: unknown[];
  subscriptions?: unknown[];
  userProfiles?: unknown[];
}) => {
  const calls: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join('$?');
    calls.push(text);
    if (text.includes('from "user"')) {
      return Promise.resolve(tables.user ?? []);
    }
    if (text.includes('from subscriptions')) {
      return Promise.resolve(tables.subscriptions ?? []);
    }
    if (text.includes('from user_profiles')) {
      return Promise.resolve(tables.userProfiles ?? []);
    }
    return Promise.reject(new Error(`Unexpected query: ${text}`));
  }) as unknown as Sql;
  return { sql, calls };
};

const profileRow = (emailNotificationsEnabledAt: string | null) => ({
  email_notifications_enabled_at: emailNotificationsEnabledAt,
});

describe('checkEmailDeliveryEligibility', () => {
  it('returns eligible for allowlisted email with no subscriptions row and enabled profile', async () => {
    const { sql, calls } = makeFakeSql({
      user: [{ email: 'icianojn@gmail.com' }],
      userProfiles: [profileRow('2026-01-01T00:00:00Z')],
    });

    await expect(checkEmailDeliveryEligibility(sql, 'user-1')).resolves.toBe('eligible');
    // Allowlist must skip the subscriptions gate entirely.
    expect(calls.filter((text) => text.includes('from subscriptions'))).toHaveLength(0);
  });

  it('still honours the user profile toggle for allowlisted email', async () => {
    const { sql } = makeFakeSql({
      user: [{ email: 'icianojn@gmail.com' }],
      userProfiles: [profileRow(null)],
    });

    await expect(checkEmailDeliveryEligibility(sql, 'user-1')).resolves.toBe(
      'notifications_disabled',
    );
  });

  it('returns profile_missing for allowlisted email with no profile', async () => {
    const { sql } = makeFakeSql({
      user: [{ email: 'icianojn@gmail.com' }],
      userProfiles: [],
    });

    await expect(checkEmailDeliveryEligibility(sql, 'user-1')).resolves.toBe('profile_missing');
  });

  it('returns no_subscription for non-allowlisted email with no subscriptions row', async () => {
    const { sql } = makeFakeSql({
      user: [{ email: 'someoneelse@gmail.com' }],
    });

    await expect(checkEmailDeliveryEligibility(sql, 'user-1')).resolves.toBe('no_subscription');
  });

  it('returns no_subscription for non-allowlisted email with an inactive subscription', async () => {
    const { sql } = makeFakeSql({
      user: [{ email: 'someoneelse@gmail.com' }],
      subscriptions: [{ status: 'canceled' }],
      userProfiles: [profileRow('2026-01-01T00:00:00Z')],
    });

    await expect(checkEmailDeliveryEligibility(sql, 'user-1')).resolves.toBe('no_subscription');
  });
});
