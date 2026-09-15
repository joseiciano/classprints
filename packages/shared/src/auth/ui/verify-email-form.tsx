import {
  Fragment,
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { UseMutationOptions } from '@tanstack/react-query';
import { resendVerificationSchema, type VerificationValues } from '../schemas';
import { AuthError } from '../errors';
import { useResendVerification } from '../hooks';
import type { SessionClient } from '../../http/session-client';

const inputClassName = (hasError?: boolean) =>
  `w-full rounded-xl border bg-card px-4 py-3 text-base text-foreground outline-none transition focus:ring-2 ${
    hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
      : 'border-border focus:border-accent focus:ring-accent/20'
  }`;

export interface VerifyEmailCopy {
  title: string;
  subtitle: string;
  notice: string;
  emailLabel: string;
  passwordLabel: string;
  submitButton: string;
  submitPendingLabel?: string;
  successMessage: string;
  defaultErrorMessage: string;
  alternateActionLabel: string;
  forgotPasswordLabel: string;
}

export interface VerifyEmailFlowProps {
  copy: VerifyEmailCopy;
  defaultEmail?: string;
  redirect?: string;
  LayoutComponent?: ComponentType<{ children: ReactNode }>;
  renderSignInLink?: (context: { redirect?: string; label: string }) => ReactNode;
  renderForgotPasswordLink?: (context: { redirect?: string; label: string }) => ReactNode;
  mutationOptions?: UseMutationOptions<void, AuthError, VerificationValues>;
  sessionClient?: SessionClient;
}

const defaultLink = (href: string, label: string, redirect?: string) => {
  const url = redirect ? `${href}?redirect=${encodeURIComponent(redirect)}` : href;
  return (
    <a className="font-semibold text-accent transition hover:text-accent-soft" href={url}>
      {label}
    </a>
  );
};

const DefaultLayout: ComponentType<{ children: ReactNode }> = ({ children }) => (
  <Fragment>{children}</Fragment>
);

export function VerifyEmailFlow({
  copy,
  defaultEmail,
  redirect,
  LayoutComponent = DefaultLayout,
  renderSignInLink,
  renderForgotPasswordLink,
  mutationOptions,
  sessionClient,
}: VerifyEmailFlowProps) {
  const [form, setForm] = useState<VerificationValues>({ email: defaultEmail ?? '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof VerificationValues, string>>>(
    {},
  );
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const resendVerification = useResendVerification({ ...mutationOptions, sessionClient });

  useEffect(() => {
    setForm((prev) => ({ ...prev, email: defaultEmail ?? '' }));
  }, [defaultEmail]);

  const handleChange = (field: keyof VerificationValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setGlobalMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalMessage(null);

    const result = resendVerificationSchema.safeParse(form);
    if (!result.success) {
      const issues: Partial<Record<keyof VerificationValues, string>> = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0] as keyof VerificationValues;
        issues[path] = issue.message;
      }
      setFieldErrors(issues);
      return;
    }

    try {
      await resendVerification.mutateAsync(result.data);
      setGlobalMessage(copy.successMessage);
    } catch (error) {
      if (error instanceof AuthError) {
        setGlobalMessage(error.info.friendlyMessage);
      } else {
        setGlobalMessage(copy.defaultErrorMessage);
      }
    }
  };

  const pendingLabel = copy.submitPendingLabel ?? 'Resending…';

  return (
    <LayoutComponent>
      <section className="mx-auto flex w-full flex-1 flex-col justify-center gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:max-w-[480px]">
        <header className="grid gap-4">
          <h1 className="text-3xl font-semibold text-foreground">{copy.title}</h1>
          <p className="text-base text-muted-foreground">{copy.subtitle}</p>
          <p className="text-sm text-muted-foreground">{copy.notice}</p>
        </header>
        {globalMessage ? (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-900">
            {globalMessage}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="grid gap-16">
          <label className="grid gap-8">
            <span className="text-sm font-semibold text-foreground">{copy.emailLabel}</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => handleChange('email', event.target.value)}
              placeholder="you@example.com"
              required
              className={inputClassName(Boolean(fieldErrors.email))}
            />
            {fieldErrors.email ? (
              <span className="text-sm text-red-600">{fieldErrors.email}</span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-foreground">{copy.passwordLabel}</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => handleChange('password', event.target.value)}
              placeholder="Account password"
              required
              className={inputClassName(Boolean(fieldErrors.password))}
            />
            {fieldErrors.password ? (
              <span className="text-sm text-red-600">{fieldErrors.password}</span>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={resendVerification.isPending}
            className="rounded-xl bg-accent px-4 py-3 font-semibold text-background transition hover:bg-accent-soft focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {resendVerification.isPending ? pendingLabel : copy.submitButton}
          </button>
        </form>
        <nav className="mt-6 grid gap-3">
          {renderSignInLink
            ? renderSignInLink({ redirect, label: copy.alternateActionLabel })
            : defaultLink('/sign-in', copy.alternateActionLabel, redirect)}
          {renderForgotPasswordLink
            ? renderForgotPasswordLink({ redirect, label: copy.forgotPasswordLabel })
            : defaultLink('/forgot-password', copy.forgotPasswordLabel, redirect)}
        </nav>
      </section>
    </LayoutComponent>
  );
}
