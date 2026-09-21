export interface FooterBarProps {
  links?: { label: string; href: string }[];
  brand?: string;
  year?: number;
  className?: string;
}

export const FooterBar = ({
  links,
  brand = 'ClassPrints',
  year,
  className = '',
}: FooterBarProps) => {
  return (
    <footer className={`w-full border-t border-border bg-transparent ${className}`.trim()}>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-4 py-6 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="m-0">
          © {year ?? new Date().getFullYear()} {brand}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {(
            links ?? [
              { label: 'Terms', href: '/terms-of-service' },
              { label: 'Privacy', href: '/privacy-policy' },
            ]
          ).map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
};
