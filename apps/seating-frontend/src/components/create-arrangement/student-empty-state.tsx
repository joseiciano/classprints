interface StudentEmptyStateProps {
  onSubmitTabClick: () => void;
}

export function StudentEmptyState({ onSubmitTabClick }: StudentEmptyStateProps) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-4 rounded-[12px] border border-dashed border-line bg-muted/40 text-center text-sm text-muted-foreground">
      <p className="max-w-xs">
        Select a student from the list to set their relationships or seat contenders.
      </p>
      <button
        type="button"
        onClick={onSubmitTabClick}
        className="rounded-full border border-primary px-5 py-1.5 text-sm font-semibold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to submit
      </button>
    </div>
  );
}
