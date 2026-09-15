export interface AuthUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  emailNotificationsEnabledAt: string | null;
}

export interface AuthErrorInfo {
  code: string;
  message: string;
  friendlyMessage: string;
}

export interface AuthFieldCopy {
  emailLabel: string;
  passwordLabel: string;
  confirmPasswordLabel: string;
  displayNameLabel: string;
  submitCta: string;
  secondaryActionLabel: string;
  secondaryActionCta: string;
}

export interface AuthFormCopy {
  title: string;
  subtitle: string;
  submitButton: string;
  alternateAction: string;
}

export interface AuthCopy {
  signIn: AuthFormCopy;
  signUp: AuthFormCopy;
  forgotPassword: AuthFormCopy;
  verifyEmail: AuthFormCopy;
  fieldLabels: {
    email: string;
    password: string;
    confirmPassword: string;
    displayName: string;
  };
  links: {
    goToSignUp: string;
    goToSignIn: string;
    goToForgotPassword: string;
    goToVerifyEmail: string;
  };
  messages: {
    passwordRequirements: string[];
    verificationNotice: string;
    passwordResetSent: string;
    verificationEmailSent: string;
  };
  errors: {
    default: string;
    invalidCredentials: string;
    emailInUse: string;
    weakPassword: string;
    verificationRequired: string;
    csrfInvalid: string;
  };
}

export interface AuthSessionPersistPayload {
  idToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
}
