interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onCheckedChange, disabled, id }: SwitchProps) {
  const baseStyles =
    'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  const checkedStyle = checked ? 'bg-primary' : 'bg-gray-300';
  const disabledStyle = disabled ? 'cursor-not-allowed opacity-50' : '';
  const thumbTransform = checked ? 'translate-x-5' : 'translate-x-0';

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`${baseStyles} ${checkedStyle} ${disabledStyle}`}
      onClick={() => !disabled && onCheckedChange(!checked)}
    >
      <span
        className={`pointer-events-none block h-6 w-6 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out ${thumbTransform}`}
      />
    </button>
  );
}
