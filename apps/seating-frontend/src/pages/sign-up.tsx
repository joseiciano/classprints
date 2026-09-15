import { useCallback } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  SignUpFlow,
  type SignUpFlowClassNames,
  type SignUpFlowHandlers,
} from '@classprints/shared/auth';
import LogoUrl from '@classprints/seating-shared/assets/logos/Letter-Circle-2x.svg';
import { APPLICATION_NAME } from '../lib/constants';
import { useAuth } from '../providers/auth-provider';

export function SignUpPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const handleSignedUp = useCallback<NonNullable<SignUpFlowHandlers['onSignedUp']>>(
    async ({ values }) => {
      await navigate({
        to: '/verify-email',
        search: values.email ? { email: values.email } : undefined,
        replace: true,
      });
    },
    [navigate],
  );

  return (
    <SignUpFlow
      signUp={signUp}
      onSignedUp={handleSignedUp}
      title="Create account"
      subtitle="Request access to the seating worker console."
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
      submitLabel="Create account"
      submitPendingLabel="Creating account..."
      rememberDeviceLabel="Remember this device"
      classNames={signUpClasses}
      inputClassName={inputClasses}
      renderSignInLink={({ label }) => (
        <Link to="/sign-in" className="font-semibold text-primary">
          {label}
        </Link>
      )}
    />
  );
}

const signUpClasses: Partial<SignUpFlowClassNames> = {
  container:
    'mx-auto flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-border/70 bg-card/80 p-8 shadow-card',
  header: 'grid gap-3 text-center',
  title: 'text-3xl font-semibold text-foreground',
  subtitle: 'text-sm text-muted-foreground',
  globalError: 'rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200',
  fieldLabel: 'text-sm font-semibold text-foreground',
  fieldError: 'text-xs font-medium text-red-200',
  passwordList: 'mt-1 list-disc pl-5 text-sm text-muted-foreground',
  rememberRow: 'flex items-center gap-2 text-sm text-muted-foreground',
  submitButton:
    'inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70',
  footer: 'mt-4 text-center text-sm text-muted-foreground',
  link: 'font-semibold text-primary',
};

const inputClasses = (errored: boolean) =>
  [
    'w-full rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/70 shadow-sm transition focus:outline-none',
    'bg-card',
    errored
      ? 'border border-red-400 focus:ring-2 focus:ring-red-400/50 focus:border-red-400'
      : 'border border-border focus:ring-2 focus:ring-primary/50 focus:border-primary',
  ].join(' ');
