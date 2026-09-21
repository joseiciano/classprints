export interface LogoProps {
  className?: string;
}

export function Logo({ className = 'h-[26px] w-[26px]' }: LogoProps) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-[7px] bg-primary text-primary-foreground ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[54%] w-[54%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" opacity="0.45" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" opacity="0.45" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    </span>
  );
}
