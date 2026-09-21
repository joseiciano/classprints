type LayoutMode = 'custom' | 'random';

type LayoutModeToggleProps = {
  layoutMode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
};

const MODE_OPTIONS: { label: string; mode: LayoutMode }[] = [
  { label: 'Custom layout', mode: 'custom' },
  { label: 'Random', mode: 'random' },
];

export function LayoutModeToggle({ layoutMode, onChange }: LayoutModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Layout mode"
      className="inline-flex overflow-hidden rounded-full border border-line"
    >
      {MODE_OPTIONS.map((option, index) => {
        const isActive = layoutMode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.mode)}
            className={`px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              index > 0 ? 'border-l border-line' : ''
            } ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
