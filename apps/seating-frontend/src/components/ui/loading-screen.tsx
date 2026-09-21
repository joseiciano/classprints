export function LoadingScreen({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <div
      className={`flex ${
        fullScreen ? 'min-h-screen' : 'min-h-[50vh]'
      } items-center justify-center bg-background text-foreground`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
          aria-hidden="true"
        />
        <p className="font-mono text-[11px] uppercase tracking-[0.08em]">
          Preparing your workspace…
        </p>
      </div>
    </div>
  );
}
