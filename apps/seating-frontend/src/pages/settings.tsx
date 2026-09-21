import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuth } from '../providers/auth-provider';
import { useSubscription } from '../hooks/use-subscription';
import { useEmailNotifications } from '../hooks/use-email-notifications';
import { useDeleteAccount } from '../hooks/use-delete-account';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Dialog } from '../components/ui/dialog';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CreditCard,
  Edit2,
  Loader2,
  Mail,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPlus, openPortal, isOpeningPortal, isLoading } = useSubscription();
  const {
    isEnabled,
    isLoading: notificationsLoading,
    isUpdating,
    update,
    refresh,
  } = useEmailNotifications();
  const { deleteAccount, isDeleting, error: deleteError } = useDeleteAccount();
  const search = useSearch({ strict: false }) as { success?: boolean };
  const [localToggle, setLocalToggle] = useState<boolean | null>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [emailChangeSuccess, setEmailChangeSuccess] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    if (search.success === true) {
      const timer = setTimeout(() => {
        void navigate({ to: '/settings', replace: true });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [search.success, navigate]);

  useEffect(() => {
    if (!notificationsLoading && localToggle === null) {
      setLocalToggle(isEnabled);
    }
  }, [isEnabled, localToggle, notificationsLoading]);

  const handleToggleChange = (checked: boolean) => {
    const previousValue = localToggle ?? false;
    setLocalToggle(checked);
    update(checked, {
      onError: () => {
        setLocalToggle(previousValue);
        void refresh();
      },
    });
  };

  const handleOpenEmailDialog = () => {
    setIsEmailDialogOpen(true);
    setNewEmail(user?.email ?? '');
    setEmailChangeError(null);
    setEmailChangeSuccess(false);
  };

  const handleCloseEmailDialog = () => {
    setIsEmailDialogOpen(false);
    setNewEmail('');
    setEmailChangeError(null);
    setEmailChangeSuccess(false);
  };

  const handleChangeEmail = async () => {
    if (!newEmail || newEmail === user?.email) {
      setEmailChangeError('Please enter a new email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setEmailChangeError('Please enter a valid email address');
      return;
    }

    setIsChangingEmail(true);
    setEmailChangeError(null);

    try {
      const response = await fetch('/api/v1/user/email', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ newEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to change email');
      }

      setEmailChangeSuccess(true);

      // Close dialog after success message is shown
      setTimeout(() => {
        handleCloseEmailDialog();
      }, 2000);
    } catch (error) {
      console.error('Failed to change email:', error);
      setEmailChangeError(error instanceof Error ? error.message : 'Failed to change email');
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleOpenDeleteDialog = () => {
    setIsDeleteDialogOpen(true);
    setDeleteConfirmText('');
  };

  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setDeleteConfirmText('');
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmText !== 'delete my account') {
      return;
    }
    deleteAccount();
  };

  if (!user) {
    return null; // Layout handles redirect
  }

  return (
    <div className="space-y-7">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Account workspace
        </p>
        <h1 className="mt-2 font-display text-[32px] font-medium leading-tight text-foreground">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Manage your sign-in details, plan, and classroom update preferences.
        </p>
      </header>

      {search.success === true && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-4 rounded-[12px] border border-primary/30 bg-secondary px-5 py-4 text-secondary-foreground sm:flex-row sm:items-center"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Subscription updated</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your Plus features are ready to use.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: '/settings', replace: true })}
            className="min-h-11 justify-center sm:min-h-0"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="space-y-5">
          <section
            className="overflow-hidden rounded-[12px] border border-border bg-card shadow-sm"
            aria-labelledby="profile-heading"
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-secondary text-primary">
                <User className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="profile-heading"
                  className="font-display text-lg font-medium text-foreground"
                >
                  Profile information
                </h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Sign-in identity
                </p>
              </div>
            </div>

            <dl className="divide-y divide-border px-5">
              <div className="grid gap-2 py-4 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center">
                <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  Email
                </dt>
                <dd className="min-w-0 break-words text-sm font-medium text-foreground">
                  {user.email}
                </dd>
                <dd>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenEmailDialog}
                    className="min-h-11 w-full justify-center sm:min-h-0 sm:w-auto"
                  >
                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                    Change email
                  </Button>
                </dd>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center">
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Email status
                </dt>
                <dd>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                      user.emailVerified
                        ? 'border-primary/25 bg-secondary text-secondary-foreground'
                        : 'border-border bg-muted text-muted-foreground'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    {user.emailVerified ? 'Verified' : 'Not verified'}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          {isPlus && (
            <section
              className="overflow-hidden rounded-[12px] border border-border bg-card shadow-sm"
              aria-labelledby="notifications-heading"
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-secondary text-primary">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="notifications-heading"
                    className="font-display text-lg font-medium text-foreground"
                  >
                    Email notifications
                  </h2>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Plus preference
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-xl">
                  <label htmlFor="email-notifications" className="font-medium text-foreground">
                    Seating chart updates
                  </label>
                  <p
                    id="email-notifications-description"
                    className="mt-1 text-sm leading-6 text-muted-foreground"
                  >
                    Receive email when a seating arrangement changes and for important account
                    announcements.
                  </p>
                  <p
                    className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    aria-live="polite"
                  >
                    {notificationsLoading
                      ? 'Loading preference'
                      : isUpdating
                        ? 'Saving preference'
                        : localToggle
                          ? 'Notifications on'
                          : 'Notifications off'}
                  </p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={localToggle ?? false}
                  onCheckedChange={handleToggleChange}
                  disabled={localToggle === null || isUpdating}
                  aria-label="Email notifications"
                  aria-describedby="email-notifications-description"
                />
              </div>
            </section>
          )}

          <section
            className="overflow-hidden rounded-[12px] border border-destructive/35 bg-card shadow-sm"
            aria-labelledby="danger-heading"
          >
            <div className="flex items-center gap-3 border-b border-destructive/25 bg-destructive/10 px-5 py-4">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <div>
                <h2
                  id="danger-heading"
                  className="font-display text-lg font-medium text-foreground"
                >
                  Danger zone
                </h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-destructive">
                  Destructive action
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <p className="font-medium text-foreground">Delete this account</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This disables your account, signs you out, and cancels an active subscription.
                  Some records may be retained under our data policies.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleOpenDeleteDialog}
                className="min-h-11 shrink-0 justify-center"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete account
              </Button>
            </div>
          </section>
        </div>

        <section
          className="overflow-hidden rounded-[12px] border border-border bg-card shadow-sm lg:sticky lg:top-6"
          aria-labelledby="subscription-heading"
        >
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-border bg-secondary text-primary">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="subscription-heading"
                className="font-display text-lg font-medium text-foreground"
              >
                Subscription
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Billing and plan
              </p>
            </div>
          </div>

          {isLoading ? (
            <div role="status" className="space-y-3 px-5 py-6" aria-live="polite">
              <span className="sr-only">Loading subscription details</span>
              <div className="h-3 w-20 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-8 w-40 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-4 w-full rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-10 w-full rounded bg-muted motion-safe:animate-pulse" />
            </div>
          ) : (
            <div className="px-5 py-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Current plan
                </p>
                <span
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                    isPlus
                      ? 'border-primary/25 bg-secondary text-secondary-foreground'
                      : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {isPlus ? 'Plus' : 'Free'}
                </span>
              </div>
              <p className="mt-4 font-display text-2xl font-medium text-foreground">
                {isPlus ? 'ClassPrints Plus' : 'ClassPrints Free'}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isPlus
                  ? 'Your plan includes increased arrangement limits, reusable class profiles, and CSV exports.'
                  : 'Upgrade for more arrangements, reusable class profiles, and CSV exports.'}
              </p>

              {isPlus ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openPortal(undefined)}
                  disabled={isOpeningPortal}
                  aria-busy={isOpeningPortal}
                  className="mt-6 min-h-11 w-full justify-center"
                >
                  {isOpeningPortal ? (
                    <>
                      <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                      Opening billing…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" aria-hidden="true" />
                      Manage billing
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate({ to: '/pricing' })}
                  className="mt-6 min-h-11 w-full justify-center"
                >
                  View Plus plans
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={isEmailDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseEmailDialog();
          }
        }}
        title="Change email address"
        description="Enter the new address you want to use to sign in. We’ll send a confirmation link to that inbox."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseEmailDialog}
              disabled={isChangingEmail}
              className="min-h-11 justify-center"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleChangeEmail}
              disabled={isChangingEmail || !newEmail || newEmail === user.email}
              aria-busy={isChangingEmail}
              className="min-h-11 justify-center"
            >
              {isChangingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  Updating…
                </>
              ) : (
                'Update email'
              )}
            </Button>
          </div>
        }
      >
        <label htmlFor="new-email" className="block text-sm font-medium text-foreground">
          New email address
        </label>
        <input
          id="new-email"
          type="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleChangeEmail();
            }
          }}
          placeholder="teacher@school.org"
          className="mt-2 min-h-11 w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
          disabled={isChangingEmail}
          autoComplete="email"
          autoFocus
          aria-invalid={emailChangeError ? true : undefined}
          aria-describedby={
            emailChangeError
              ? 'email-change-error'
              : emailChangeSuccess
                ? 'email-change-success'
                : undefined
          }
        />
        {emailChangeError && (
          <p id="email-change-error" role="alert" className="mt-2 text-sm text-destructive">
            {emailChangeError}
          </p>
        )}
        {emailChangeSuccess && (
          <p
            id="email-change-success"
            role="status"
            className="mt-3 flex items-start gap-2 rounded-[10px] border border-primary/25 bg-secondary px-3 py-2.5 text-sm text-secondary-foreground"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Email updated. Check your inbox to confirm the new address.
          </p>
        )}
      </Dialog>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDeleteDialog();
          }
        }}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            Delete account
          </span>
        }
        description="This action cannot be undone. Your account will be disabled, you will be signed out, and an active subscription will be canceled."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseDeleteDialog}
              disabled={isDeleting}
              className="min-h-11 justify-center"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmText !== 'delete my account'}
              aria-busy={isDeleting}
              className="min-h-11 justify-center"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete account
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Your access cannot be restored from this screen.
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Account and classroom records may be retained according to our data policies after the
            profile is disabled.
          </p>
        </div>

        <label htmlFor="delete-confirm" className="mt-5 block text-sm font-medium text-foreground">
          Type{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-destructive">
            delete my account
          </code>{' '}
          to confirm
        </label>
        <input
          id="delete-confirm"
          type="text"
          value={deleteConfirmText}
          onChange={(event) => setDeleteConfirmText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && deleteConfirmText === 'delete my account') {
              handleDeleteAccount();
            }
          }}
          placeholder="delete my account"
          className="mt-2 min-h-11 w-full rounded-[10px] border border-destructive/35 bg-background px-3 py-2.5 text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-destructive focus-visible:ring-2 focus-visible:ring-destructive/25"
          disabled={isDeleting}
          autoComplete="off"
          autoFocus
          aria-invalid={deleteError ? true : undefined}
          aria-describedby={deleteError ? 'delete-account-error' : undefined}
        />
        {deleteError && (
          <p id="delete-account-error" role="alert" className="mt-2 text-sm text-destructive">
            {deleteError.message}
          </p>
        )}
      </Dialog>
    </div>
  );
}
