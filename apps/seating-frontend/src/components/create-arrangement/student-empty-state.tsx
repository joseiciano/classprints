interface StudentEmptyStateProps {
  onSubmitTabClick: () => void;
}

export function StudentEmptyState({ onSubmitTabClick }: StudentEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[400px] rounded-2xl border border-dashed border-border bg-muted/20 text-muted-foreground">
      <div className="text-center space-y-4">
        <p>Select a student from the list to set their seat contenders or relationships.</p>
        <button
          onClick={onSubmitTabClick}
          className="rounded-full border border-primary px-6 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition"
        >
          Skip to Submit
        </button>
      </div>
    </div>
  );
}
