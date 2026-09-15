import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { VerifyEmailFlow, type VerifyEmailCopy } from '@classprints/shared/auth';
import LogoUrl from '@classprints/seating-shared/assets/logos/Letter-Circle-2x.svg';
import { APPLICATION_NAME } from '../lib/constants';
import { getAuthSessionClient } from '../lib/auth-client';

const verifyEmailCopy: VerifyEmailCopy = {
  title: 'Verify email',
  subtitle: 'Confirm your email to continue.',
  notice: 'Check your inbox for the verification link. You can resend it below.',
  emailLabel: 'Email',
  passwordLabel: 'Password',
  submitButton: 'Resend verification',
  submitPendingLabel: 'Resending…',
  successMessage: 'Verification email sent. Check your inbox to confirm your account.',
  defaultErrorMessage: 'Something went wrong. Please try again.',
  alternateActionLabel: 'Back to sign in',
  forgotPasswordLabel: 'Forgot password?',
};

const parseSearch = (search: string) => {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return {
    email: params.get('email') ?? undefined,
    redirect: params.get('redirect') ?? undefined,
  };
};

function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mb-4 flex flex-col items-center justify-center gap-3">
        <img src={LogoUrl} alt="Logo" className="h-32 w-32 object-contain" />
        <span
          className="text-3xl font-semibold text-foreground"
          style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
        >
          {APPLICATION_NAME}
        </span>
      </div>
      {children}
    </>
  );
}

export function VerifyEmailPage() {
  const location = useLocation();
  const { email, redirect } = parseSearch(location.searchStr ?? '');
  const sessionClient = getAuthSessionClient();

  return (
    <VerifyEmailFlow
      copy={verifyEmailCopy}
      defaultEmail={email}
      redirect={redirect}
      sessionClient={sessionClient}
      LayoutComponent={VerifyEmailLayout}
      renderSignInLink={({ label }) => (
        <Link
          to="/sign-in"
          search={redirect ? { redirect } : undefined}
          className="font-semibold text-primary"
        >
          {label}
        </Link>
      )}
      renderForgotPasswordLink={() => null}
    />
  );
}
