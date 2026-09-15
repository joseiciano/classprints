import type { AuthCopy } from './types';

const genericCopy: AuthCopy = {
  signIn: {
    title: 'Sign in',
    subtitle: 'Access your account to continue.',
    submitButton: 'Sign in',
    alternateAction: 'Need an account? Sign up',
  },
  signUp: {
    title: 'Create account',
    subtitle: 'Enter your details to start.',
    submitButton: 'Create account',
    alternateAction: 'Already have an account? Sign in',
  },
  forgotPassword: {
    title: 'Forgot password',
    subtitle: 'Send a reset link to your email.',
    submitButton: 'Send reset link',
    alternateAction: 'Return to sign in',
  },
  verifyEmail: {
    title: 'Verify email',
    subtitle: 'Confirm your email to continue.',
    submitButton: 'Resend verification',
    alternateAction: 'Back to sign in',
  },
  fieldLabels: {
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    displayName: 'Display name',
  },
  links: {
    goToSignUp: 'Sign up',
    goToSignIn: 'Sign in',
    goToForgotPassword: 'Forgot password?',
    goToVerifyEmail: 'Verify email',
  },
  messages: {
    passwordRequirements: ['Use at least eight characters'],
    verificationNotice: 'Check your email for further instructions.',
    passwordResetSent: 'If an account exists, a reset email was sent.',
    verificationEmailSent: 'Verification email sent.',
  },
  errors: {
    default: 'Something went wrong. Please try again.',
    invalidCredentials: 'Invalid credentials.',
    emailInUse: 'Email already in use.',
    weakPassword: 'Password is too weak.',
    verificationRequired: 'Please verify your email before continuing.',
    csrfInvalid: 'Security token expired. Refresh the page and try again.',
  },
};

let currentCopy: AuthCopy = genericCopy;

export const configureAuthCopy = (copy: AuthCopy): void => {
  currentCopy = copy;
};

export const getAuthCopy = (): AuthCopy => currentCopy;

export interface AuthSessionConfig {
  accessTokenCookie: string;
  refreshTokenCookie: string;
  csrfCookie: string;
  csrfHeader: string;
}

const defaultSessionConfig: AuthSessionConfig = {
  accessTokenCookie: 'access_token',
  refreshTokenCookie: 'refresh_token',
  csrfCookie: 'csrf_token',
  csrfHeader: 'X-CSRF-Token',
};

let sessionConfig: AuthSessionConfig = { ...defaultSessionConfig };

export const configureAuthSession = (config: Partial<AuthSessionConfig>): void => {
  sessionConfig = { ...sessionConfig, ...config };
};

export const getAuthSessionConfig = (): AuthSessionConfig => sessionConfig;
