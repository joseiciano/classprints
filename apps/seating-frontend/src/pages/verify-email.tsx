import type { ReactNode } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { VerifyEmailFlow, type VerifyEmailCopy } from '@classprints/shared/auth';
import { getAuthSessionClient } from '../lib/auth-client';

const verifyEmailCopy: VerifyEmailCopy = {
  title: 'Verify your email.',
  subtitle: 'Confirm your educator account before opening the classroom workspace.',
  notice: 'Use the link in your inbox. If it expired or never arrived, resend it below.',
  emailLabel: 'Email address',
  passwordLabel: 'Account password',
  submitButton: 'Resend verification email',
  submitPendingLabel: 'Resending…',
  successMessage: 'Verification email sent. Check your inbox to confirm your account.',
  defaultErrorMessage: 'We couldn’t resend the email. Please try again.',
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
    <div className="mx-auto flex w-full max-w-[1120px] justify-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full max-w-[480px]">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
          Email confirmation
        </p>
        <div className="[&>section]:max-w-none [&>section]:rounded-[12px] [&>section]:border-border [&>section]:p-6 [&>section]:shadow-sm sm:[&>section]:p-8 [&_button]:min-h-11 [&_button]:rounded-full [&_button]:bg-primary [&_button]:text-primary-foreground [&_form]:gap-4 [&_h1]:font-display [&_h1]:font-medium [&_h1]:tracking-[-0.01em] [&_input]:rounded-lg [&_input]:bg-background [&_label]:gap-2 [&_[role=status]]:border-primary/30 [&_[role=status]]:bg-secondary [&_[role=status]]:text-secondary-foreground">
          {children}
        </div>
      </div>
    </div>
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
          className="font-semibold text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
        >
          {label}
        </Link>
      )}
      renderForgotPasswordLink={() => null}
    />
  );
}
