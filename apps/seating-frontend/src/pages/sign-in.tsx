import { useCallback, type ReactNode } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { SignInFlow, type SignInFlowHandlers } from '@classprints/shared/auth';
import { useAuth } from '../providers/auth-provider';

function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] justify-center px-4 py-12 sm:px-6 sm:py-16">
      {children}
    </div>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { verified?: boolean };
  const { signIn, user, initializing } = useAuth();

  const handleSignedIn = useCallback<NonNullable<SignInFlowHandlers['onSignedIn']>>(
    async ({ user }) => {
      if (!user.emailVerified) {
        await navigate({
          to: '/verify-email',
          search: user.email ? { email: user.email, redirect: '/' } : { redirect: '/' },
          replace: true,
        });
        return;
      }
      await navigate({ to: '/' });
    },
    [navigate],
  );

  const handleAlreadyAuthenticated = useCallback<
    NonNullable<SignInFlowHandlers['onAlreadyAuthenticated']>
  >(
    async ({ user }) => {
      if (!user.emailVerified) {
        await navigate({
          to: '/verify-email',
          search: user.email ? { email: user.email, redirect: '/' } : { redirect: '/' },
          replace: true,
        });
        return;
      }
      await navigate({ to: '/', replace: true });
    },
    [navigate],
  );

  return (
    <SignInFlow
      signIn={signIn}
      user={user}
      initializing={initializing}
      onSignedIn={handleSignedIn}
      onAlreadyAuthenticated={handleAlreadyAuthenticated}
      LayoutComponent={AuthPageLayout}
      title={<span className="font-display font-medium">Welcome back.</span>}
      subtitle="Sign in to return to your classroom charts and saved profiles."
      eyebrow={<span className="font-mono text-primary">Classroom workspace</span>}
      notice={search.verified ? 'Email verified. You can sign in now.' : undefined}
      containerClassName="mx-auto flex w-full max-w-[480px] flex-col gap-4 rounded-[12px] border border-border bg-card p-6 shadow-sm sm:p-8 [&_button]:rounded-full [&_h1]:tracking-[-0.01em] [&_input]:rounded-lg [&_input]:bg-background"
      headerAlign="start"
      titleAlign="start"
      supportingTextAlign="start"
      submitLabel="Sign in"
      submitPendingLabel="Signing in…"
      rememberDeviceLabel="Remember this device"
      renderForgotPasswordLink={null}
      renderSignUpLink={({ label }) => (
        <span>
          New to ClassPrints?{' '}
          <Link
            to="/sign-up"
            className="font-semibold text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
          >
            {label}
          </Link>
        </span>
      )}
      renderSupportNotice={() => (
        <span>
          Need help signing in?{' '}
          <Link
            to="/customer-service"
            className="font-semibold text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
          >
            Contact support
          </Link>
          .
        </span>
      )}
    />
  );
}
