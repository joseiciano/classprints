/**
 * Accounts force-granted the Plus tier regardless of Stripe subscription
 * state (internal/testing accounts). Email comparison is case-insensitive.
 */
export const PLUS_ALLOWLIST_EMAILS: readonly string[] = ['icianojn@gmail.com'];

export function isPlusAllowlistedEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }
  return PLUS_ALLOWLIST_EMAILS.includes(email.trim().toLowerCase());
}
