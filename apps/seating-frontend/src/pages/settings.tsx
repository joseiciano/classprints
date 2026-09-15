import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuth } from '../providers/auth-provider';
import { useSubscription } from '../hooks/use-subscription';
import { useEmailNotifications } from '../hooks/use-email-notifications';
import { useDeleteAccount } from '../hooks/use-delete-account';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Dialog } from '../components/ui/dialog';
import {
  CreditCard,
  Loader2,
  CheckCircle2,
  User,
  Mail,
  Settings as SettingsIcon,
  Bell,
  Edit2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPlus, openPortal, isOpeningPortal, isLoading } = useSubscription();
  const { isEnabled, update, refresh } = useEmailNotifications();
  const { deleteAccount, isDeleting, error: deleteError } = useDeleteAccount();
  const search = useSearch({ from: '/settings' }) as { success?: boolean };
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

  // Initialize local toggle from server state
  useEffect(() => {
    if (isEnabled !== undefined && localToggle === null) {
      setLocalToggle(isEnabled);
    }
  }, [isEnabled, localToggle]);

  const handleToggleChange = (checked: boolean) => {
    setLocalToggle(checked);
    update(checked, {
      onError: () => {
        // Revert to server state on error
        refresh();
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
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <SettingsIcon className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your account and subscription</p>
        </div>
      </div>

      {search.success === true && (
        <div className="p-6 bg-green-500/10 border-2 border-green-500/30 rounded-[2rem] flex flex-col sm:flex-row items-center gap-4 text-green-700 animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-500 shadow-lg shadow-green-500/5">
          <div className="p-3 bg-green-500/20 rounded-2xl">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="text-lg font-display font-bold">Success!</h3>
            <p className="font-medium opacity-90">
              Your subscription has been updated. You now have access to all Plus features.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: '/settings', replace: true })}
            className="ml-auto text-green-700 hover:bg-green-500/20"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid gap-6">
        {/* Profile Section */}
        <section className="p-8 bg-card rounded-3xl border border-border shadow-soft">
          <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Profile Information
          </h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-10">
              <div className="w-32 flex items-center gap-2 text-muted-foreground text-sm font-medium">
                <Mail className="w-4 h-4" />
                Email
              </div>
              <div className="text-foreground font-medium flex-1">{user.email}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenEmailDialog}
                className="shrink-0"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-10">
              <div className="w-32 flex items-center gap-2 text-muted-foreground text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Verified
              </div>
              <div className="text-foreground font-medium">{user.emailVerified ? 'Yes' : 'No'}</div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Delete Account
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Note: One you delete your account, there is no going back. All data associated
                  will be deleted.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleOpenDeleteDialog}
                className="shrink-0"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="p-8 bg-card rounded-3xl border border-border shadow-soft">
          <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Subscription Plan
          </h2>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-accent/5 rounded-2xl border border-accent/10">
            {isLoading ? (
              <div className="flex items-center gap-4 w-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded animate-pulse w-32" />
                  <div className="h-6 bg-muted rounded animate-pulse w-48" />
                  <div className="h-4 bg-muted rounded animate-pulse w-96" />
                </div>
                <div className="h-10 bg-muted rounded animate-pulse w-32" />
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Current Plan
                    </p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        isPlus
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isPlus ? 'Plus' : 'Free'}
                    </span>
                  </div>
                  <p className="text-2xl font-display font-bold">
                    {isPlus ? 'Seating Chart Plus' : 'Seating Chart Free'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-md">
                    {isPlus
                      ? 'You have access to all premium features including increased arrangement limits and CSV exports.'
                      : 'Upgrade to Plus for more arrangements, CSV exports, and saved profiles.'}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {isPlus ? (
                    <Button
                      variant="mint"
                      onClick={() => openPortal(undefined)}
                      disabled={isOpeningPortal || isLoading}
                      className="w-full md:w-auto"
                    >
                      {isOpeningPortal ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Opening Portal...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Manage Billing
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="playful"
                      onClick={() => navigate({ to: '/pricing' })}
                      className="w-full md:w-auto"
                    >
                      Upgrade Now
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Email Notifications Section - Plus members only */}
        {isPlus && (
          <section className="p-8 bg-card rounded-3xl border border-border shadow-soft">
            <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Email Notifications
            </h2>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-accent/5 rounded-2xl border border-accent/10">
              <div className="flex-1">
                <p className="text-base font-semibold text-foreground">
                  Receive Email Notifications
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Get notified about seating arrangement updates and important announcements via
                  email.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={localToggle ?? false}
                  onCheckedChange={handleToggleChange}
                  disabled={localToggle === null}
                />
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Email Change Dialog */}
      <Dialog
        open={isEmailDialogOpen}
        onOpenChange={setIsEmailDialogOpen}
        title="Change Email"
        description="Enter your new email address. You'll need to confirm it by clicking a link we'll send to your new inbox."
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseEmailDialog}
              disabled={isChangingEmail}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleChangeEmail}
              disabled={isChangingEmail || !newEmail || newEmail === user?.email}
            >
              {isChangingEmail ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Email'
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="new-email" className="block text-sm font-medium text-foreground mb-2">
              New Email Address
            </label>
            <input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleChangeEmail();
                }
              }}
              placeholder="Enter your new email"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
              disabled={isChangingEmail}
              autoFocus
            />
            {emailChangeError && (
              <p className="mt-2 text-sm text-destructive">{emailChangeError}</p>
            )}
            {emailChangeSuccess && (
              <p className="mt-2 text-sm text-green-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Email updated successfully! Please check your inbox to confirm.
              </p>
            )}
          </div>
        </div>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) {
            setDeleteConfirmText('');
          }
        }}
        title={
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Delete Account
          </div>
        }
        description="This action cannot be undone. This will soft-delete your account and you will be signed out."
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseDeleteDialog}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmText !== 'delete my account'}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
            <p className="text-sm font-medium text-destructive">
              Warning: This will soft-delete your account. All your data will be marked as deleted
              but retained in our system.
            </p>
          </div>

          <div>
            <label
              htmlFor="delete-confirm"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Type{' '}
              <code className="px-2 py-0.5 bg-muted rounded text-destructive font-bold">
                delete my account
              </code>{' '}
              to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deleteConfirmText === 'delete my account') {
                  handleDeleteAccount();
                }
              }}
              placeholder="Type here to confirm"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:border-transparent"
              disabled={isDeleting}
              autoFocus
            />
            {deleteError && <p className="mt-2 text-sm text-destructive">{deleteError.message}</p>}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
