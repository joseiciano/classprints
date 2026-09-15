export function LoadingScreen({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <div
      className={`flex ${
        fullScreen ? 'min-h-screen' : 'min-h-[50vh]'
      } items-center justify-center bg-background text-foreground`}
    >
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium">Loading console…</p>
      </div>
    </div>
  );
}
