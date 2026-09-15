type LayoutMode = 'custom' | 'random';

type LayoutModeToggleProps = {
  layoutMode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
};

type LayoutModeButtonProps = {
  label: string;
  mode: LayoutMode;
  isActive: boolean;
  onSelect: (mode: LayoutMode) => void;
};

function LayoutModeButton({ label, mode, isActive, onSelect }: LayoutModeButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-full px-4 py-1.5 transition ${
        isActive
          ? 'bg-primary text-primary-foreground shadow-soft'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={() => onSelect(mode)}
    >
      {label}
    </button>
  );
}

export function LayoutModeToggle({ layoutMode, onChange }: LayoutModeToggleProps) {
  const options: Array<{ label: string; mode: LayoutMode }> = [
    { label: 'Custom', mode: 'custom' },
    { label: 'Random', mode: 'random' },
  ];

  return (
    <div className="inline-flex rounded-full border border-border bg-muted/40 p-1 text-sm font-semibold">
      {options.map((option) => (
        <LayoutModeButton
          key={option.mode}
          label={option.label}
          mode={option.mode}
          isActive={layoutMode === option.mode}
          onSelect={onChange}
        />
      ))}
    </div>
  );
}
