import { CreditCard, Loader2 } from 'lucide-react';
import { useSubscription } from '../hooks/use-subscription';
import { Button } from './ui/button';

export function SubscriptionStatus() {
  const { isPlus, openPortal, isOpeningPortal, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-border animate-pulse">
        <div className="w-4 h-4 rounded-full bg-muted" />
        <div className="w-16 h-3 rounded bg-muted" />
      </div>
    );
  }

  if (!isPlus) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => openPortal(undefined)}
      disabled={isOpeningPortal}
      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
      title="Manage Subscription"
    >
      {isOpeningPortal ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CreditCard className="h-4 w-4" />
      )}
    </Button>
  );
}
