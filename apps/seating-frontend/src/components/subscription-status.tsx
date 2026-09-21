import { CreditCard, Loader2 } from 'lucide-react';
import { useSubscription } from '../hooks/use-subscription';
import { Button } from './ui/button';

export function SubscriptionStatus() {
  const { isPlus, openPortal, isOpeningPortal, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div
        role="status"
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
        Checking plan
      </div>
    );
  }

  if (!isPlus) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => openPortal(undefined)}
      disabled={isOpeningPortal}
      aria-busy={isOpeningPortal}
      aria-label="Manage Plus subscription billing"
      className="min-h-10 rounded-full px-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
    >
      {isOpeningPortal ? (
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {isOpeningPortal ? 'Opening billing' : 'Plus · Manage billing'}
    </Button>
  );
}
