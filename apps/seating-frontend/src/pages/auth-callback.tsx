import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { getAuthSessionClient } from '../lib/auth-client';
import { seatingWorkerFetcher } from '../lib/http';

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        await navigate({ to: '/sign-in', replace: true });
        return;
      }

      try {
        await seatingWorkerFetcher('/auth/exchange-tokens', {
          method: 'POST',
          body: {
            accessToken,
            refreshToken,
          },
          credentials: 'include',
        });
        window.history.replaceState({}, document.title, window.location.pathname);
        await new Promise<void>((resolve) => setTimeout(resolve, 300));

        const sessionClient = getAuthSessionClient();
        const user = await sessionClient.getSession();

        if (!user) {
          await navigate({ to: '/sign-in', replace: true });
          return;
        }

        if (!user.emailVerified) {
          await navigate({
            to: '/verify-email',
            search: user.email ? { email: user.email, redirect: '/' } : { redirect: '/' },
            replace: true,
          });
          return;
        }

        await navigate({ to: '/', replace: true });
      } catch (error) {
        console.error('Error processing auth callback:', error);
        await navigate({ to: '/sign-in', replace: true });
      }
    };

    void handleCallback();
  }, [navigate]);

  return (
    <div className="mx-auto flex min-h-[360px] w-full max-w-[1120px] items-center justify-center px-4 py-12 sm:px-6">
      <section
        className="w-full max-w-[480px] rounded-[12px] border border-border bg-card p-8 text-center shadow-sm"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
          Confirming your account
        </p>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-[-0.01em]">
          Opening your classroom workspace…
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          We’re finishing your email confirmation and checking your session.
        </p>
      </section>
    </div>
  );
}
