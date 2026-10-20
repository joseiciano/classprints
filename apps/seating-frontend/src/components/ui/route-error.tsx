import type { ErrorComponentProps } from '@tanstack/react-router';
import { isChunkLoadError } from '../../lib/chunk-reload';
import { Button } from './button';

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const isStaleBuild = isChunkLoadError(error);

  return (
    <div
      className="flex min-h-[50vh] items-center justify-center px-4 text-foreground"
      role="alert"
    >
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-display text-2xl font-medium">
          {isStaleBuild ? 'A new version is available' : 'Something went wrong'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isStaleBuild
            ? 'This page was updated while you had it open. Reload to continue.'
            : 'This page failed to load. Try again, or reload if it keeps happening.'}
        </p>
        <div className="flex justify-center gap-3">
          {isStaleBuild ? null : (
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          )}
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    </div>
  );
}
