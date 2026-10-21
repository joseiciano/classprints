import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { SUBSCRIPTION_LIMITS } from '@classprints/seating-shared';
import { Button } from '../components/ui/button';
import { fetchSubscription } from '../lib/billing-api';
import { useAuth } from '../providers/auth-provider';

const POLL_INTERVAL_MS = 2000;
// Stripe redirects here before its webhook has necessarily reached the API.
const SYNC_TIMEOUT_MS = 30_000;

export function BillingSuccessPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  // Same key as useSubscription, so the rest of the app sees Plus as soon as this does.
  const subscriptionQuery = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: fetchSubscription,
    enabled: !!user,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.tier === 'plus' || timedOut ? false : POLL_INTERVAL_MS,
  });
  const isPlus = subscriptionQuery.data?.tier === 'plus';

  useEffect(() => {
    if (isPlus) return;
    const timer = setTimeout(() => setTimedOut(true), SYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isPlus]);

  const retry = () => {
    setTimedOut(false);
    void subscriptionQuery.refetch();
  };

  const limits = SUBSCRIPTION_LIMITS.plus;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <div role="status" aria-live="polite" className="flex flex-col items-center">
        {isPlus ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="mt-5 font-display text-[32px] font-medium leading-tight text-foreground">
              You have successfully subscribed to Plus
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {limits.arrangementsPerWeek} arrangements a week, up to {limits.maxResultsPerRun}{' '}
              results per run, CSV export, and saved profiles.
            </p>
          </>
        ) : timedOut ? (
          <>
            <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h1 className="mt-5 font-display text-[32px] font-medium leading-tight text-foreground">
              Payment received, still syncing
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your plan should update within a minute. If Plus doesn&apos;t show up, contact
              support.
            </p>
          </>
        ) : (
          <>
            <Loader2
              className="h-10 w-10 text-primary motion-safe:animate-spin"
              aria-hidden="true"
            />
            <h1 className="mt-5 font-display text-[32px] font-medium leading-tight text-foreground">
              Confirming your payment…
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This usually takes a few seconds.
            </p>
          </>
        )}
      </div>

      {isPlus ? (
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            variant="primary"
            size="md"
            className="min-h-11 rounded-full"
            onClick={() => void navigate({ to: '/create-arrangement' })}
          >
            Start an arrangement
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="min-h-11"
            onClick={() => void navigate({ to: '/settings' })}
          >
            View settings
          </Button>
        </div>
      ) : timedOut ? (
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button variant="outline" size="md" className="min-h-11 rounded-full" onClick={retry}>
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="min-h-11"
            onClick={() => void navigate({ to: '/customer-service' })}
          >
            Contact support
          </Button>
        </div>
      ) : null}
    </div>
  );
}
