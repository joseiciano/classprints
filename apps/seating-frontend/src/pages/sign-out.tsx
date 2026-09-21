import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { ApiError } from '@classprints/shared';
import { Button } from '../components/ui/button';
import { useAuth } from '../providers/auth-provider';

export function SignOutPage() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('Signing you out…');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      void navigate({ to: '/', replace: true });
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await signOut.mutateAsync();
        if (!cancelled) {
          setStatus('success');
          setMessage('You have been signed out.');
        }
      } catch (error) {
        console.error('Failed to sign out', error);
        if (!cancelled) {
          const errorMessage =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Unable to complete sign out. Please try again.';
          setStatus('error');
          setMessage(errorMessage);
          setErrorDetails(error instanceof ApiError ? error.code : null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  const handleRetry = async () => {
    setStatus('pending');
    setMessage('Signing you out…');
    setErrorDetails(null);

    try {
      await signOut.mutateAsync();
      setStatus('success');
      setMessage('You have been signed out.');
    } catch (error) {
      console.error('Failed to sign out', error);
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to complete sign out. Please try again.';
      setStatus('error');
      setMessage(errorMessage);
      setErrorDetails(error instanceof ApiError ? error.code : null);
    }
  };

  const StatusIcon =
    status === 'error' ? TriangleAlert : status === 'success' ? CheckCircle2 : Loader2;

  return (
    <div className="mx-auto flex min-h-[360px] w-full max-w-[1120px] items-center justify-center px-4 py-12 sm:px-6">
      <section className="w-full max-w-[480px] rounded-[12px] border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <StatusIcon
          className={`mx-auto h-6 w-6 ${
            status === 'error'
              ? 'text-destructive'
              : status === 'success'
                ? 'text-primary'
                : 'animate-spin text-primary'
          }`}
          aria-hidden="true"
        />
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
          Account session
        </p>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-[-0.01em]">Sign out</h1>

        <div
          className={`mt-5 rounded-[12px] border px-4 py-3 text-sm ${
            status === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : status === 'success'
                ? 'border-primary/30 bg-secondary text-secondary-foreground'
                : 'border-border bg-background text-muted-foreground'
          }`}
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {message}
          {errorDetails ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] opacity-80">
              Error · {errorDetails}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 text-sm">
          {status === 'success' ? (
            <>
              <Link
                to="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Return to overview
              </Link>
              <Link
                to="/sign-in"
                className="font-semibold text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
              >
                Sign in again
              </Link>
            </>
          ) : (
            <>
              <Button
                type="button"
                disabled={status === 'pending'}
                onClick={() => {
                  void handleRetry();
                }}
                className="min-h-11 w-full justify-center rounded-full"
              >
                {status === 'pending' ? 'Signing out…' : 'Try again'}
              </Button>
              <Link
                to="/"
                className="font-semibold text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
              >
                Return to overview
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
