import { getAuthSessionConfig } from './config';

export const getAccessTokenCookieName = (): string => getAuthSessionConfig().accessTokenCookie;
export const getRefreshTokenCookieName = (): string => getAuthSessionConfig().refreshTokenCookie;
export const getCsrfCookieName = (): string => getAuthSessionConfig().csrfCookie;
export const getCsrfHeaderName = (): string => getAuthSessionConfig().csrfHeader;

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseCookieString = (cookieString?: string): Record<string, string> => {
  if (!cookieString) {
    if (typeof document === 'undefined') {
      return {};
    }

    cookieString = document.cookie;
  }

  return (cookieString?.split(';') ?? []).reduce<Record<string, string>>((acc, part) => {
    const [rawName, ...rawValue] = part.split('=');
    if (!rawName) {
      return acc;
    }

    const name = rawName.trim();
    if (!name) {
      return acc;
    }

    acc[name] = decode(rawValue.join('=').trim());
    return acc;
  }, {});
};

export const readCookie = (name: string, cookieString?: string): string | null => {
  const cookies = parseCookieString(cookieString);
  return cookies[name] ?? null;
};

export const readCsrfToken = (cookieString?: string): string | null =>
  readCookie(getCsrfCookieName(), cookieString);
