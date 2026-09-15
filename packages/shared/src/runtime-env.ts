export type RuntimeEnvRecord = Record<string, string | undefined>;

const isObject = (value: unknown): value is RuntimeEnvRecord =>
  typeof value === 'object' && value !== null;

declare global {
  // eslint-disable-next-line no-var
  var __SHARED_RUNTIME_ENV__: RuntimeEnvRecord | undefined;
  // eslint-disable-next-line no-var
  var __CLASSPRINTS_RUNTIME_ENV__: RuntimeEnvRecord | undefined;
}

const runtimeEnvShimKey = '__SHARED_RUNTIME_ENV__';

const getRuntimeEnvShim = (): RuntimeEnvRecord | undefined => {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  const globalScope = globalThis as typeof globalThis & {
    [runtimeEnvShimKey]?: RuntimeEnvRecord;
    __CLASSPRINTS_RUNTIME_ENV__?: RuntimeEnvRecord;
  };

  const value = globalScope[runtimeEnvShimKey] ?? globalScope.__CLASSPRINTS_RUNTIME_ENV__;

  if (isObject(value)) {
    return value;
  }

  return undefined;
};

const getImportMetaEnv = (): RuntimeEnvRecord | undefined => {
  try {
    const importMeta = Function(
      'try { return typeof import !== "undefined" ? import.meta : undefined; } catch { return undefined; }',
    )() as { env?: unknown } | undefined;

    if (importMeta && isObject(importMeta.env)) {
      return importMeta.env;
    }
  } catch {
    // Accessing import.meta can throw in some tooling contexts; ignore.
  }
  return undefined;
};

const getProcessEnv = (): RuntimeEnvRecord | undefined => {
  if (typeof globalThis === 'undefined' || !('process' in globalThis)) {
    return undefined;
  }

  const maybeProcess = (
    globalThis as typeof globalThis & {
      process?: { env?: unknown };
    }
  ).process;

  if (maybeProcess && isObject(maybeProcess.env)) {
    return maybeProcess.env;
  }

  return undefined;
};

const resolveEnvSources = (): RuntimeEnvRecord[] => {
  const sources: RuntimeEnvRecord[] = [];

  const shimEnv = getRuntimeEnvShim();
  if (shimEnv) {
    sources.push(shimEnv);
  }

  const importEnv = getImportMetaEnv();
  if (importEnv) {
    sources.push(importEnv);
  }

  const processEnv = getProcessEnv();
  if (processEnv) {
    sources.push(processEnv);
  }

  return sources;
};

export const registerRuntimeEnv = (env: RuntimeEnvRecord): RuntimeEnvRecord => {
  if (typeof globalThis === 'undefined') {
    return env;
  }

  const existing = getRuntimeEnvShim() ?? {};

  // Filter out undefined/null values from the new env before merging
  const filteredEnv: RuntimeEnvRecord = {};
  for (const key in env) {
    if (env[key] !== undefined && env[key] !== null) {
      filteredEnv[key] = env[key];
    }
  }

  const merged: RuntimeEnvRecord = { ...existing, ...filteredEnv };

  (
    globalThis as typeof globalThis & {
      [runtimeEnvShimKey]?: RuntimeEnvRecord;
    }
  )[runtimeEnvShimKey] = merged;

  return merged;
};

export const readEnv = (key: string): string | undefined => {
  for (const source of resolveEnvSources()) {
    if (key in source) {
      const value = source[key];
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return undefined;
};

const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export const isLocalHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return localHosts.has(window.location.hostname);
};
