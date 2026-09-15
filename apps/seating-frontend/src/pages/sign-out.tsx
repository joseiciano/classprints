import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../providers/auth-provider';
import { ApiError } from '@classprints/shared';

export function SignOutPage() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('Signing you out…');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    // If user is already signed out, redirect to home
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
          setStatus('error');
          const errorMessage =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Unable to complete sign out. Please try again.';
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
      setStatus('error');
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to complete sign out. Please try again.';
      setMessage(errorMessage);
      setErrorDetails(error instanceof ApiError ? error.code : null);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-border/70 bg-card/80 p-8 text-center shadow-card">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Seating Console</p>
        <h1 className="text-3xl font-semibold">Sign out</h1>
      </header>

      <div
        className={`rounded-2xl border px-4 py-3 text-sm ${
          status === 'error'
            ? 'border-destructive/50 bg-destructive/10 text-destructive'
            : 'border-border bg-background/80 text-muted-foreground'
        }`}
        role="status"
      >
        {message}
        {errorDetails && <p className="mt-1 text-xs opacity-75">Error: {errorDetails}</p>}
      </div>

      <div className="flex flex-col gap-3 text-sm">
        {status === 'success' ? (
          <>
            <Link
              to="/"
              className="rounded-full border border-border px-4 py-2 font-semibold text-foreground transition hover:border-foreground"
            >
              Return to overview
            </Link>
            <Link to="/sign-in" className="text-primary transition hover:text-primary/80">
              Go back to sign in
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={status === 'pending'}
              onClick={() => {
                void handleRetry();
              }}
              className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
            >
              {status === 'pending' ? 'Working…' : 'Try again'}
            </button>
            <Link to="/" className="text-muted-foreground transition hover:text-foreground">
              Return to overview
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
