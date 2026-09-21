import { useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import type { BillingPlan } from '@classprints/shared';
import { Button } from '../components/ui/button';
import { useSubscription } from '../hooks/use-subscription';
import { fetchPlans } from '../lib/billing-api';
import { useAuth } from '../providers/auth-provider';

type BillingPeriod = 'monthly' | 'quarterly' | 'annual';

const billingPeriods: { value: BillingPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

const freeFeatures = [
  '2 seating arrangements per week',
  '1 result option per run',
  'Results available for 30 days',
  'Algorithmic and AI-assisted generation',
];

const plusFeatureFallback = [
  '10 seating arrangements per week',
  'Up to 5 result options per run',
  'Unlimited result visibility',
  'Saved reusable class profiles',
  'CSV export',
  'Result email support',
  'Algorithmic and AI-assisted generation',
];

function FeatureList({
  features,
  emphasized = false,
}: {
  features: string[];
  emphasized?: boolean;
}) {
  return (
    <ul className="mt-7 grid gap-3">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-3 text-[15px] leading-6">
          <Check
            className={`mt-1 h-4 w-4 shrink-0 ${
              emphasized ? 'text-primary-foreground' : 'text-primary'
            }`}
            aria-hidden="true"
          />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

function PricingSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2" role="status" aria-live="polite">
      <span className="sr-only">Loading current billing plans</span>
      {[0, 1].map((item) => (
        <div
          key={item}
          className="min-h-[430px] animate-pulse rounded-2xl border border-border bg-card p-7"
          aria-hidden="true"
        >
          <div className="h-3 w-20 rounded-full bg-muted" />
          <div className="mt-6 h-12 w-36 rounded-lg bg-muted" />
          <div className="mt-8 grid gap-4">
            {[0, 1, 2, 3, 4].map((line) => (
              <div key={line} className="h-4 rounded-full bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, checkout, isCheckingOut, isPlus } = useSubscription();
  const isSignedIn = Boolean(user);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoadingPlans(true);
    setLoadError(false);

    fetchPlans()
      .then((fetchedPlans) => {
        if (active) setPlans(fetchedPlans);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setIsLoadingPlans(false);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const handleAction = (planId: string) => {
    if (!isSignedIn) {
      void navigate({ to: '/sign-up' });
      return;
    }

    if (planId === 'free' || isPlus) {
      void navigate({ to: '/create-arrangement' });
      return;
    }

    checkout(planId as 'plus_monthly' | 'plus_quarterly' | 'plus_annual');
  };

  const getPlanForPeriod = (period: BillingPeriod): BillingPlan | undefined => {
    if (period === 'monthly') return plans.find((plan) => plan.id === 'plus_monthly');
    if (period === 'quarterly') return plans.find((plan) => plan.id === 'plus_quarterly');
    return plans.find((plan) => plan.id === 'plus_annual');
  };

  const currentPlan = getPlanForPeriod(billingPeriod);
  const isCurrentPlan = (planId: string): boolean => {
    if (planId === 'free') return isSignedIn && !isPlus;
    return subscription?.planId === planId;
  };

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 py-12 text-foreground sm:px-6 sm:py-16 lg:py-20">
      <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
          Simple plans
        </p>
        <h1 className="mt-3 font-display text-[clamp(2.5rem,5vw,3.5rem)] font-medium leading-tight tracking-[-0.02em]">
          Plans that fit your classroom.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Start free. Upgrade for more weekly charts, reusable class profiles, and exports.
        </p>
      </header>

      <div className="mb-8 flex justify-center">
        <div
          className="inline-flex max-w-full overflow-x-auto rounded-full border border-border bg-muted p-1"
          role="group"
          aria-label="Billing period"
        >
          {billingPeriods.map((period) => (
            <button
              key={period.value}
              type="button"
              aria-pressed={billingPeriod === period.value}
              onClick={() => setBillingPeriod(period.value)}
              className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                billingPeriod === period.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {isLoadingPlans ? (
        <PricingSkeleton />
      ) : loadError ? (
        <section
          className="rounded-[12px] border border-destructive/40 bg-destructive/10 px-6 py-10 text-center"
          role="alert"
        >
          <h2 className="font-display text-2xl font-medium">We couldn’t load the paid plans.</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Your current plan and billing are unaffected. Try again to review plan details before
            subscribing.
          </p>
          <Button
            variant="outline"
            className="mx-auto mt-6 min-h-11 rounded-full"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </section>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <article className="flex min-h-[430px] flex-col rounded-2xl border border-border bg-card p-7 shadow-sm sm:p-8">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Free
                </p>
                {isCurrentPlan('free') ? (
                  <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-secondary-foreground">
                    Current plan
                  </span>
                ) : null}
              </div>
              <p className="mt-3 font-display text-5xl font-medium tabular-nums">
                $0 <span className="font-sans text-base text-muted-foreground">/ month</span>
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                The essentials for building occasional classroom arrangements.
              </p>
              <FeatureList features={freeFeatures} />
            </div>
            <Button
              variant="outline"
              size="md"
              className="mt-auto min-h-11 w-full justify-center rounded-full"
              disabled={isCurrentPlan('free')}
              onClick={() => handleAction('free')}
            >
              {isCurrentPlan('free')
                ? 'Current plan'
                : isSignedIn
                  ? 'Create a chart'
                  : 'Start free'}
            </Button>
          </article>

          {currentPlan ? (
            <article className="flex min-h-[430px] flex-col rounded-2xl border border-primary bg-primary p-7 text-primary-foreground shadow-sm sm:p-8">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary-foreground/75">
                    {currentPlan.name}
                  </p>
                  {isCurrentPlan(currentPlan.id) ? (
                    <span className="rounded-full border border-primary-foreground/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-primary-foreground">
                      Current plan
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 font-display text-5xl font-medium tabular-nums">
                  ${currentPlan.price}{' '}
                  <span className="font-sans text-base text-primary-foreground/75">
                    / {currentPlan.period}
                  </span>
                </p>
                <p className="mt-3 text-sm text-primary-foreground/80">{currentPlan.description}</p>
                <FeatureList
                  features={
                    currentPlan.features?.length ? currentPlan.features : plusFeatureFallback
                  }
                  emphasized
                />
              </div>
              <Button
                variant="outline"
                size="md"
                className="mt-auto min-h-11 w-full justify-center rounded-full border-primary-foreground/40 bg-card text-foreground hover:bg-secondary"
                disabled={isCurrentPlan(currentPlan.id) || isCheckingOut}
                onClick={() => handleAction(currentPlan.id)}
              >
                {isCheckingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Opening checkout…
                  </>
                ) : isCurrentPlan(currentPlan.id) ? (
                  'Current plan'
                ) : isPlus ? (
                  'Continue with Plus'
                ) : (
                  'Upgrade to Plus'
                )}
              </Button>
            </article>
          ) : (
            <article className="flex min-h-[430px] flex-col justify-center rounded-2xl border border-border bg-card p-8 text-center">
              <h2 className="font-display text-2xl font-medium">
                This billing period is unavailable.
              </h2>
              <p className="mt-2 text-muted-foreground">
                Choose another period to see the currently available Plus plan.
              </p>
            </article>
          )}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        AI-assisted generation follows the same availability flag on both plans; it is not a
        Plus-only feature.
      </p>
    </div>
  );
}
