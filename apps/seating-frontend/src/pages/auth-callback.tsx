import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { seatingWorkerFetcher } from '../lib/http';
import { getAuthSessionClient } from '../lib/auth-client';

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
        await new Promise((resolve) => setTimeout(resolve, 300));

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
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-2 text-foreground">
      <p>Processing your email confirmation...</p>
    </div>
  );
}
