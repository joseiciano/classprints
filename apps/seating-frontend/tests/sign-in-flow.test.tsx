import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignInFlow, type SignInFlowProps } from '@classprints/shared/auth';

describe('SignInFlow verification notice', () => {
  it('renders supplied notice as a status message', () => {
    const signIn = {
      isPending: false,
      mutateAsync: async () => ({
        id: 'unused-user-id',
        email: 'unused@example.com',
        emailVerified: true,
        displayName: null,
        emailNotificationsEnabledAt: null,
      }),
    } as SignInFlowProps['signIn'];

    const markup = renderToStaticMarkup(
      <SignInFlow signIn={signIn} user={null} notice="Email verified. Sign in to continue." />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Email verified. Sign in to continue.');
  });
});
