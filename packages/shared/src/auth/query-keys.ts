export const authQueryKeys = {
  root: ['auth'] as const,
  session: () => [...authQueryKeys.root, 'session'] as const,
  profile: () => [...authQueryKeys.root, 'profile'] as const,
};
