import { Check, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../providers/auth-provider';
import { useSubscription } from '../hooks/use-subscription';
import { useState, useEffect } from 'react';
import { fetchPlans } from '../lib/billing-api';
import type { BillingPlan } from '@classprints/shared';

type BillingPeriod = 'monthly' | 'quarterly' | 'annual';

const FREE_TIER = {
  id: 'free',
  name: 'Free',
  price: 0,
  period: 'month' as const,
  description: 'Perfect for getting started with our tools.',
  features: [
    'Generate 2 seating arrangements per week.',
    'Generate 1 arrangement per use.',
    'View arrangements for up to 1 months.',
  ],
};

export function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, checkout, isCheckingOut, isPlus } = useSubscription();
  const isSignedIn = !!user;
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);

  useEffect(() => {
    fetchPlans().then((fetchedPlans) => {
      setPlans(fetchedPlans);
      setIsLoadingPlans(false);
    });
  }, []);

  const handleAction = (planId: string) => {
    if (!isSignedIn) {
      navigate({ to: '/sign-up' });
      return;
    }

    if (planId === 'free') {
      navigate({ to: '/create-arrangement' });
      return;
    }

    if (isPlus) {
      navigate({ to: '/create-arrangement' });
      return;
    }

    checkout(planId as 'plus_monthly' | 'plus_quarterly' | 'plus_annual');
  };

  const getPlanForPeriod = (period: BillingPeriod): BillingPlan | undefined => {
    if (period === 'monthly') return plans.find((p) => p.id === 'plus_monthly');
    if (period === 'quarterly') return plans.find((p) => p.id === 'plus_quarterly');
    if (period === 'annual') return plans.find((p) => p.id === 'plus_annual');
    return undefined;
  };

  const currentPlan = getPlanForPeriod(billingPeriod);

  const isCurrentPlan = (planId: string): boolean => {
    if (planId === 'free' && !isPlus) return true;
    if (subscription?.planId && subscription.planId === planId) return true;
    return false;
  };

  if (isLoadingPlans) {
    return (
      <div className="min-h-screen bg-background py-16 px-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-16 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Membership Plans</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Choose the plan that works best for you. Upgrade or unsubscribe anytime.
          </p>

          {/* Billing Period Toggle */}
          <div className="inline-flex items-center gap-2 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === 'monthly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('quarterly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === 'quarterly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Quarterly
              <span className="ml-1 text-green-600 text-xs font-semibold">Save 22%</span>
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === 'annual'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Annual
              <span className="ml-1 text-green-600 text-xs font-semibold">Save 42%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Tier */}
          <div
            className={`relative p-8 rounded-3xl border-2 transition-all duration-300 hover:shadow-lg flex flex-col ${
              isCurrentPlan('free') ? 'bg-card border-border' : 'bg-card border-border'
            }`}
          >
            <div className="flex-1">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-display font-bold mb-2">{FREE_TIER.name}</h2>
                <div className="flex items-baseline justify-center gap-1 mb-3">
                  <span className="text-4xl font-display font-bold">${FREE_TIER.price}</span>
                  <span className="text-muted-foreground">/{FREE_TIER.period}</span>
                </div>
                <p className="text-muted-foreground text-sm">{FREE_TIER.description}</p>
              </div>

              <div className="space-y-4">
                {FREE_TIER.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-primary/20">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="mint"
              size="lg"
              className="w-full mt-8"
              disabled={isCurrentPlan('free')}
              onClick={() => handleAction('free')}
            >
              {isCurrentPlan('free') ? 'Current Plan' : 'Get Started'}
            </Button>
          </div>

          {/* Plus Tier */}
          {currentPlan && (
            <div
              className={`relative p-8 rounded-3xl border-2 transition-all duration-300 hover:shadow-lg flex flex-col ${
                billingPeriod !== 'monthly'
                  ? 'bg-primary/5 border-primary shadow-lg'
                  : 'bg-primary/5 border-primary shadow-lg'
              }`}
            >
              {billingPeriod !== 'monthly' && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-1 rounded-full">
                    Best Value
                  </span>
                </div>
              )}

              <div className="flex-1">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-display font-bold mb-2">{currentPlan.name}</h2>
                  <div className="flex items-baseline justify-center gap-1 mb-3">
                    <span className="text-4xl font-display font-bold">${currentPlan.price}</span>
                    <span className="text-muted-foreground">/{currentPlan.period}</span>
                    {billingPeriod !== 'monthly' && (
                      <span className="text-muted-foreground text-sm ml-2">
                        ($
                        {(currentPlan.price / (billingPeriod === 'quarterly' ? 3 : 12)).toFixed(2)}
                        /month)
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">{currentPlan.description}</p>
                </div>

                <div className="space-y-4">
                  {currentPlan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-primary">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant="playful"
                size="lg"
                className="w-full mt-8"
                disabled={isCurrentPlan(currentPlan.id)}
                onClick={() => handleAction(currentPlan.id)}
              >
                {isCheckingOut && subscription?.planId !== currentPlan.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : isCurrentPlan(currentPlan.id) ? (
                  'Current Plan'
                ) : (
                  'Upgrade Now'
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
