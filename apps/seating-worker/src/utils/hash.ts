export const sha256 = async (value: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SubtleCrypto unavailable');
  }
  const data = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
