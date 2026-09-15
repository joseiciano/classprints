/**
 * Generates a UUID external identifier for user-facing job references.
 * Uses the Web Crypto API (crypto.randomUUID()) available in Cloudflare Workers.
 *
 * This keeps internal job IDs hidden from end users while providing a standard
 * UUID that is stored separately in the database.
 */
export const generateExternalId = (): string => {
  return crypto.randomUUID();
};
