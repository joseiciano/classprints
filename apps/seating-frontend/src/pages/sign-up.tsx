import { useCallback, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  SignUpFlow,
  type SignUpFlowClassNames,
  type SignUpFlowHandlers,
} from '@classprints/shared/auth';
import { useAuth } from '../providers/auth-provider';

function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] justify-center px-4 py-12 sm:px-6 sm:py-16">
      {children}
    </div>
  );
}

const signUpClasses: Partial<SignUpFlowClassNames> = {
  container:
    'mx-auto flex w-full max-w-[480px] flex-col gap-5 rounded-[12px] border border-border bg-card p-6 shadow-sm sm:p-8',
  header: 'grid gap-3 text-left',
  title: 'font-display text-3xl font-medium tracking-[-0.01em] text-foreground',
  subtitle: 'text-base leading-6 text-muted-foreground',
  globalError:
    'rounded-[12px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive',
  form: 'grid gap-4',
  field: 'grid gap-2',
  fieldLabel: 'text-sm font-semibold text-foreground',
  fieldError: 'text-xs font-medium text-destructive',
  input:
    'w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground/70 transition focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
  inputError: 'border-destructive focus:border-destructive focus:ring-destructive/30',
  passwordList: 'mt-1 list-disc pl-5 text-sm text-muted-foreground',
  rememberRow: 'flex items-center gap-2 text-sm text-muted-foreground',
  rememberCheckbox:
    'h-4 w-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0',
  submitButton:
    'inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70',
  footer: 'mt-2 text-center text-sm text-muted-foreground',
  link: 'font-semibold text-primary underline decoration-border underline-offset-4 hover:decoration-primary',
};
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
      LayoutComponent={AuthPageLayout}
      title="Create your account."
      subtitle="Build thoughtful classroom seating charts from your roster, room layout, and the student needs you know best."
      renderLogo={() => (
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
          Classroom workspace
        </p>
      )}
      submitLabel="Create account"
      submitPendingLabel="Creating account…"
      rememberDeviceLabel="Remember this device"
      classNames={signUpClasses}
      renderSignInLink={({ label }) => (
        <span>
          Already have an account?{' '}
          <Link
            to="/sign-in"
            className="font-semibold text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
          >
            {label}
          </Link>
        </span>
      )}
    />
  );
}
