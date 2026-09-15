import {
  Fragment,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { signUpSchema, type SignUpValues } from '../schemas';
import type { AuthCopy, AuthUser } from '../types';
import { AuthError } from '../errors';
import { getAuthCopy } from '../config';

export type SignUpLinkRenderer = (context: { redirect?: string; label: string }) => ReactNode;

export interface SignUpFlowHandlers {
  onSignedUp?: (context: {
    user: AuthUser;
    values: SignUpValues;
    redirect?: string;
  }) => Promise<void> | void;
}

export interface SignUpFlowClassNames {
  container: string;
  header: string;
  title: string;
  subtitle: string;
  globalError: string;
  form: string;
  field: string;
  fieldLabel: string;
  fieldError: string;
  input: string;
  inputError: string;
  passwordList: string;
  rememberRow: string;
  rememberCheckbox: string;
  submitButton: string;
  footer: string;
  link: string;
}

export interface SignUpFlowProps extends SignUpFlowHandlers {
  signUp: UseMutationResult<AuthUser, AuthError, SignUpValues>;
  redirect?: string;
  copy?: AuthCopy;
  title?: ReactNode;
  subtitle?: ReactNode;
  submitLabel?: string;
  submitPendingLabel?: string;
  rememberDeviceLabel?: ReactNode;
  renderLogo?: () => ReactNode;
  renderSignInLink?: SignUpLinkRenderer | null;
  LayoutComponent?: ComponentType<{ children: ReactNode }>;
  classNames?: Partial<SignUpFlowClassNames>;
  inputClassName?: (hasError: boolean) => string;
}

const defaultClassNames: SignUpFlowClassNames = {
  container:
    'mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-4 rounded-xl bg-card p-6',
  header: 'grid gap-2',
  title: 'text-3xl font-semibold text-foreground',
  subtitle: 'text-base text-muted-foreground',
  globalError:
    'rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-3 text-sm text-destructive',
  form: 'grid gap-4',
  field: 'grid gap-2',
  fieldLabel: 'text-sm font-semibold text-foreground',
  fieldError: 'text-xs font-medium text-destructive',
  input:
    'w-full rounded-xl border border-border bg-card-alt px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/70 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
  inputError: 'border-destructive/75 focus:border-destructive focus:ring-destructive/30',
  passwordList: 'mt-1 list-disc pl-5 text-sm text-muted-foreground',
  rememberRow: 'flex items-center gap-2 text-sm text-muted-foreground',
  rememberCheckbox:
    'h-4 w-4 rounded border-border text-primary focus:ring-primary/40 focus:ring-offset-0',
  submitButton:
    'inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70',
  footer: 'mt-6',
  link: 'font-semibold text-primary transition hover:text-primary-soft',
};

const DefaultLayout: ComponentType<{ children: ReactNode }> = ({ children }) => (
  <Fragment>{children}</Fragment>
);

export function SignUpFlow({
  signUp,
  redirect,
  copy,
  title,
  subtitle,
  submitLabel,
  submitPendingLabel,
  rememberDeviceLabel,
  renderLogo,
  renderSignInLink,
  LayoutComponent = DefaultLayout,
  classNames,
  inputClassName,
  onSignedUp,
}: SignUpFlowProps) {
  const resolvedCopy = copy ?? getAuthCopy();
  const resolvedClassNames = useMemo(() => ({ ...defaultClassNames, ...classNames }), [classNames]);
  const resolvedSubmitLabel = submitLabel ?? resolvedCopy.signUp.submitButton;
  const resolvedPendingLabel = submitPendingLabel ?? 'Creating account...';
  const resolvedRememberLabel = rememberDeviceLabel ?? 'Remember this device';
  const resolvedSubtitle = subtitle ?? resolvedCopy.signUp.subtitle;

  const [form, setForm] = useState<SignUpValues>({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    remember: true,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SignUpValues, string>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const resolveInputClass = (hasError: boolean) => {
    if (inputClassName) {
      return inputClassName(hasError);
    }
    return hasError
      ? `${resolvedClassNames.input} ${resolvedClassNames.inputError}`
      : resolvedClassNames.input;
  };

  const handleFieldChange = (field: keyof SignUpValues, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setGlobalError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalError(null);

    const result = signUpSchema.safeParse(form);
    if (!result.success) {
      const issues: Partial<Record<keyof SignUpValues, string>> = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0] as keyof SignUpValues;
        issues[path] = issue.message;
      }
      setFieldErrors(issues);
      return;
    }

    try {
      const user = await signUp.mutateAsync(result.data);
      await onSignedUp?.({ user, values: result.data, redirect });
    } catch (error) {
      if (error instanceof AuthError) {
        setGlobalError(error.info.friendlyMessage);
        return;
      }
      setGlobalError(resolvedCopy.errors.default);
    }
  };

  const SignInLink = useMemo<SignUpLinkRenderer | null>((): SignUpLinkRenderer | null => {
    if (renderSignInLink === null) {
      return null;
    }
    if (renderSignInLink) {
      return renderSignInLink;
    }
    return ({ redirect: nextRedirect, label }) => {
      const href = nextRedirect
        ? `/sign-in?redirect=${encodeURIComponent(nextRedirect)}`
        : '/sign-in';
      return (
        <a className={resolvedClassNames.link} href={href}>
          {label}
        </a>
      );
    };
  }, [renderSignInLink, resolvedClassNames.link]);

  return (
    <LayoutComponent>
      <section className={resolvedClassNames.container}>
        <header className={resolvedClassNames.header}>
          {renderLogo ? renderLogo() : null}
          <h1 className={resolvedClassNames.title}>{title ?? resolvedCopy.signUp.title}</h1>
          {resolvedSubtitle ? (
            <p className={resolvedClassNames.subtitle}>{resolvedSubtitle}</p>
          ) : null}
        </header>
        {globalError ? (
          <div className={resolvedClassNames.globalError} role="alert">
            {globalError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className={resolvedClassNames.form}>
          <label className={resolvedClassNames.field}>
            <span className={resolvedClassNames.fieldLabel}>
              {resolvedCopy.fieldLabels.displayName}
            </span>
            <input
              type="text"
              value={form.displayName}
              onChange={(event) => handleFieldChange('displayName', event.target.value)}
              placeholder="Jordan Rivers"
              required
              className={resolveInputClass(Boolean(fieldErrors.displayName))}
              autoComplete="name"
            />
            {fieldErrors.displayName ? (
              <span className={resolvedClassNames.fieldError}>{fieldErrors.displayName}</span>
            ) : null}
          </label>

          <label className={resolvedClassNames.field}>
            <span className={resolvedClassNames.fieldLabel}>{resolvedCopy.fieldLabels.email}</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => handleFieldChange('email', event.target.value)}
              placeholder="you@example.com"
              required
              className={resolveInputClass(Boolean(fieldErrors.email))}
              autoComplete="email"
            />
            {fieldErrors.email ? (
              <span className={resolvedClassNames.fieldError}>{fieldErrors.email}</span>
            ) : null}
          </label>

          <label className={resolvedClassNames.field}>
            <span className={resolvedClassNames.fieldLabel}>
              {resolvedCopy.fieldLabels.password}
            </span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => handleFieldChange('password', event.target.value)}
              placeholder="••••••••"
              required
              className={resolveInputClass(Boolean(fieldErrors.password))}
              autoComplete="new-password"
            />
            {fieldErrors.password ? (
              <span className={resolvedClassNames.fieldError}>{fieldErrors.password}</span>
            ) : null}
            {resolvedCopy.messages.passwordRequirements.length > 0 ? (
              <ul className={resolvedClassNames.passwordList}>
                {resolvedCopy.messages.passwordRequirements.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </label>

          <label className={resolvedClassNames.field}>
            <span className={resolvedClassNames.fieldLabel}>
              {resolvedCopy.fieldLabels.confirmPassword}
            </span>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => handleFieldChange('confirmPassword', event.target.value)}
              placeholder="Repeat password"
              required
              className={resolveInputClass(Boolean(fieldErrors.confirmPassword))}
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword ? (
              <span className={resolvedClassNames.fieldError}>{fieldErrors.confirmPassword}</span>
            ) : null}
          </label>

          <label className={resolvedClassNames.rememberRow}>
            <input
              type="checkbox"
              checked={form.remember ?? true}
              onChange={(event) => handleFieldChange('remember', event.target.checked)}
              className={resolvedClassNames.rememberCheckbox}
            />
            <span>{resolvedRememberLabel}</span>
          </label>

          <button
            type="submit"
            disabled={signUp.isPending}
            className={resolvedClassNames.submitButton}
          >
            {signUp.isPending ? resolvedPendingLabel : resolvedSubmitLabel}
          </button>
        </form>
        {SignInLink ? (
          <nav className={resolvedClassNames.footer}>
            {SignInLink({ redirect, label: resolvedCopy.links.goToSignIn })}
          </nav>
        ) : null}
      </section>
    </LayoutComponent>
  );
}
