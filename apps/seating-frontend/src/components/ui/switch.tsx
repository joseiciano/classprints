interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export function Switch({ checked, onCheckedChange, disabled, id, ...ariaProps }: SwitchProps) {
  const baseStyles =
    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-px transition-colors duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const checkedStyle = checked ? 'border-primary bg-primary' : 'border-border bg-muted';
  const disabledStyle = disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer';
  const thumbTransform = checked ? 'translate-x-5' : 'translate-x-0';

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      {...ariaProps}
      className={`${baseStyles} ${checkedStyle} ${disabledStyle}`}
      onClick={() => !disabled && onCheckedChange(!checked)}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-card shadow-sm ring-1 ring-border/30 transition-transform duration-200 ease-out motion-reduce:transition-none ${thumbTransform}`}
      />
    </button>
  );
}
