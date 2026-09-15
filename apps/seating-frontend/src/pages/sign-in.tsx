import { useCallback } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { SignInFlow, type SignInFlowHandlers } from '@classprints/shared/auth';
import LogoUrl from '@classprints/seating-shared/assets/logos/Letter-Circle-2x.svg';
import { APPLICATION_NAME } from '../lib/constants';
import { useAuth } from '../providers/auth-provider';

export function SignInPage() {
  const navigate = useNavigate();
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
      title="Sign in"
      subtitle="Use your worker credentials to continue."
      eyebrow="Seating Console"
      renderLogo={() => (
        <div className="mx-auto flex flex-col items-center gap-3">
          <img src={LogoUrl} alt="Logo" className="h-32 w-32 object-contain" />
          <span
            className="text-3xl font-semibold text-foreground"
            style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
          >
            {APPLICATION_NAME}
          </span>
        </div>
      )}
      containerClassName="mx-auto flex w-full max-w-lg flex-col gap-8 rounded-2xl border border-border/70 bg-card/80 p-8 shadow-card"
      headerAlign="start"
      titleAlign="center"
      supportingTextAlign="center"
      submitLabel="Sign in"
      submitPendingLabel="Signing in…"
      rememberDeviceLabel="Remember this device"
      renderForgotPasswordLink={null}
      renderSignUpLink={({ label }) => (
        <span>
          Need access?{' '}
          <Link to="/sign-up" className="font-semibold text-primary">
            {label}
          </Link>
        </span>
      )}
      renderSupportNotice={() => (
        <span>
          Having trouble accessing the console?{' '}
          <Link to="/" className="font-semibold text-primary">
            Contact the ops team
          </Link>
          .
        </span>
      )}
    />
  );
}
