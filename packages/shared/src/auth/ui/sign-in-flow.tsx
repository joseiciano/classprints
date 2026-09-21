import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { signInSchema, type SignInValues } from '../schemas';
import type { AuthCopy, AuthUser } from '../types';
import { AuthError } from '../errors';
import { getAuthCopy } from '../config';

export type SignInLinkRenderer = (context: { redirect?: string; label: string }) => ReactNode;
export type SignInNoticeRenderer = (context: { redirect?: string }) => ReactNode;

export interface SignInFlowHandlers {
  onSignedIn?: (context: { user: AuthUser; redirect?: string }) => Promise<void> | void;
  onAlreadyAuthenticated?: (context: { user: AuthUser; redirect?: string }) => Promise<void> | void;
}

export interface SignInFlowProps extends SignInFlowHandlers {
  signIn: UseMutationResult<AuthUser, AuthError, SignInValues>;
  user: AuthUser | null;
  initializing?: boolean;
  redirect?: string;
  copy?: AuthCopy;
  title?: ReactNode;
  subtitle?: ReactNode;
  notice?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  submitLabel?: string;
  submitPendingLabel?: string;
  rememberDeviceLabel?: ReactNode;
  renderLogo?: () => ReactNode;
  renderForgotPasswordLink?: SignInLinkRenderer | null;
  renderSignUpLink?: SignInLinkRenderer | null;
  renderVerifyEmailLink?: SignInLinkRenderer | null;
  renderSupportNotice?: SignInNoticeRenderer;
  LayoutComponent?: ComponentType<{ children: ReactNode }>;
  containerClassName?: string;
  headerAlign?: 'start' | 'center';
  titleAlign?: 'start' | 'center';
  supportingTextAlign?: 'start' | 'center';
}

const DefaultLayout: ComponentType<{ children: ReactNode }> = ({ children }) => (
  <Fragment>{children}</Fragment>
);

const baseContainerClass =
  'mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-4 rounded-xl bg-card p-0 sm:p-6';

const inputBaseClass =
  'w-full rounded-xl border bg-card-alt px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 transition-colors';

const resolveInputClass = (hasError?: string) =>
  `${inputBaseClass} ${hasError ? 'border-destructive/75 focus:border-destructive focus:ring-destructive/30' : 'border-border focus:border-primary focus:ring-primary/20'}`;

export function SignInFlow({
  signIn,
  user,
  initializing,
  redirect,
  copy,
  title,
  subtitle,
  notice,
  description,
  eyebrow,
  submitLabel,
  submitPendingLabel,
  rememberDeviceLabel,
  renderLogo,
  renderForgotPasswordLink,
  renderSignUpLink,
  renderVerifyEmailLink,
  renderSupportNotice,
  LayoutComponent = DefaultLayout,
  containerClassName,
  headerAlign = 'center',
  titleAlign,
  supportingTextAlign,
  onSignedIn,
  onAlreadyAuthenticated,
}: SignInFlowProps) {
  const resolvedCopy = copy ?? getAuthCopy();
  const [form, setForm] = useState<SignInValues>({ email: '', password: '', remember: true });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SignInValues, string>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showVerifyLink, setShowVerifyLink] = useState(false);

  const resolvedSubmitLabel = submitLabel ?? resolvedCopy.signIn.submitButton;
  const resolvedPendingLabel = submitPendingLabel ?? 'Signing in…';
  const resolvedRememberLabel = rememberDeviceLabel ?? 'Remember this device';
  const resolvedSubtitle = subtitle ?? resolvedCopy.signIn.subtitle;
  const resolvedDescription = description ?? null;

  useEffect(() => {
    if (!initializing && user && onAlreadyAuthenticated) {
      void onAlreadyAuthenticated({ user, redirect });
    }
  }, [initializing, onAlreadyAuthenticated, redirect, user]);

  const handleFieldChange = (field: keyof SignInValues, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setGlobalError(null);
    setShowVerifyLink(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalError(null);

    const result = signInSchema.safeParse(form);
    if (!result.success) {
      const issues: Partial<Record<keyof SignInValues, string>> = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0] as keyof SignInValues;
        issues[path] = issue.message;
      }
      setFieldErrors(issues);
      return;
    }

    try {
      const nextUser = await signIn.mutateAsync(result.data);
      await onSignedIn?.({ user: nextUser, redirect });
    } catch (error) {
      if (error instanceof AuthError) {
        setGlobalError(error.info.friendlyMessage);
        setShowVerifyLink(error.info.friendlyMessage === resolvedCopy.errors.verificationRequired);
        return;
      }
      setGlobalError(resolvedCopy.errors.default);
    }
  };

  const ForgotPasswordLink = useMemo<SignInLinkRenderer | null>((): SignInLinkRenderer | null => {
    if (renderForgotPasswordLink === null) {
      return null;
    }
    if (renderForgotPasswordLink) {
      return renderForgotPasswordLink;
    }
    return ({ redirect: nextRedirect, label }) => {
      const href = nextRedirect
        ? `/forgot-password?redirect=${encodeURIComponent(nextRedirect)}`
        : '/forgot-password';
      return (
        <a className="font-semibold text-primary transition hover:text-primary-soft" href={href}>
          {label}
        </a>
      );
    };
  }, [renderForgotPasswordLink]);

  const SignUpLink = useMemo<SignInLinkRenderer | null>((): SignInLinkRenderer | null => {
    if (renderSignUpLink === null) {
      return null;
    }
    if (renderSignUpLink) {
      return renderSignUpLink;
    }
    return ({ redirect: nextRedirect, label }) => {
      const href = nextRedirect
        ? `/sign-up?redirect=${encodeURIComponent(nextRedirect)}`
        : '/sign-up';
      return (
        <a className="font-semibold text-primary transition hover:text-primary-soft" href={href}>
          {label}
        </a>
      );
    };
  }, [renderSignUpLink]);

  const VerifyEmailLink = useMemo<SignInLinkRenderer | null>((): SignInLinkRenderer | null => {
    if (renderVerifyEmailLink === null) {
      return null;
    }
    if (renderVerifyEmailLink) {
      return renderVerifyEmailLink;
    }
    return ({ redirect: nextRedirect, label }) => {
      const params = new URLSearchParams();
      if (form.email) {
        params.set('email', form.email);
      }
      if (nextRedirect) {
        params.set('redirect', nextRedirect);
      }
      const suffix = params.toString();
      const href = suffix ? `/verify-email?${suffix}` : '/verify-email';
      return (
        <a className="font-semibold text-primary transition hover:text-primary-soft" href={href}>
          {label}
        </a>
      );
    };
  }, [form.email, renderVerifyEmailLink]);

  const headerClasses =
    headerAlign === 'start'
      ? 'mb-4 grid gap-4 text-left'
      : 'mb-4 grid justify-items-center gap-8 text-center';
  const resolvedTitleAlign = titleAlign ?? headerAlign;
  const resolvedSupportingAlign = supportingTextAlign ?? headerAlign;
  const titleClass = resolvedTitleAlign === 'center' ? 'text-center' : 'text-left';
  const supportingClass = resolvedSupportingAlign === 'center' ? 'text-center' : 'text-left';

  return (
    <LayoutComponent>
      <section className={containerClassName ?? baseContainerClass}>
        <header className={headerClasses}>
          {renderLogo ? renderLogo() : null}
          {eyebrow ? (
            <div
              className={`text-xs uppercase tracking-[0.24em] text-muted-foreground ${supportingClass}`}
            >
              {eyebrow}
            </div>
          ) : null}
          <h1 className={`text-3xl font-semibold text-foreground ${titleClass}`}>
            {title ?? resolvedCopy.signIn.title}
          </h1>
          {resolvedSubtitle ? (
            <p className={`text-base text-muted-foreground ${supportingClass}`}>
              {resolvedSubtitle}
            </p>
          ) : null}
          {resolvedDescription ? (
            <p className={`text-sm text-muted-foreground ${supportingClass}`}>
              {resolvedDescription}
            </p>
          ) : null}
        </header>

        {notice ? (
          <div
            className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-foreground"
            role="status"
            aria-live="polite"
          >
            {notice}
          </div>
        ) : null}

        {globalError ? (
          <div
            className="rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {globalError}
          </div>
        ) : null}

        {showVerifyLink && VerifyEmailLink ? (
          <div className="text-sm text-muted-foreground">
            {VerifyEmailLink({ redirect, label: resolvedCopy.links.goToVerifyEmail })}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-foreground">
              {resolvedCopy.fieldLabels.email}
            </span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => handleFieldChange('email', event.target.value)}
              placeholder="enter email here"
              required
              className={resolveInputClass(fieldErrors.email)}
              autoComplete="email"
            />
            {fieldErrors.email ? (
              <span className="text-xs font-medium text-destructive">{fieldErrors.email}</span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-foreground">
              {resolvedCopy.fieldLabels.password}
            </span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => handleFieldChange('password', event.target.value)}
              placeholder="••••••••"
              required
              className={resolveInputClass(fieldErrors.password)}
              autoComplete="current-password"
            />
            {fieldErrors.password ? (
              <span className="text-xs font-medium text-destructive">{fieldErrors.password}</span>
            ) : null}
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={form.remember ?? true}
                onChange={(event) => handleFieldChange('remember', event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40 focus:ring-offset-0"
              />
              <span>{resolvedRememberLabel}</span>
            </label>
            {ForgotPasswordLink ? (
              <span className="text-sm">
                {ForgotPasswordLink({ redirect, label: resolvedCopy.links.goToForgotPassword })}
              </span>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={signIn.isPending}
            className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            {signIn.isPending ? resolvedPendingLabel : resolvedSubmitLabel}
          </button>
        </form>

        {SignUpLink ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-1 text-sm text-muted-foreground">
            {SignUpLink({ redirect, label: resolvedCopy.links.goToSignUp })}
          </div>
        ) : null}

        {renderSupportNotice ? (
          <div className="text-center text-sm text-muted-foreground">
            {renderSupportNotice({ redirect })}
          </div>
        ) : null}
      </section>
    </LayoutComponent>
  );
}
