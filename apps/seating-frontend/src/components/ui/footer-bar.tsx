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
    <footer className={`bg-transparent py-6 w-full ${className}`.trim()}>
      <div className="mx-auto max-w-1280 px-4 text-center">
        <p className="m-0 font-sans text-sm text-muted-foreground">
          © {year ?? new Date().getFullYear()} {brand}. All rights reserved.
        </p>
        <div className="flex justify-center gap-4 mt-2">
          {(
            links ?? [
              { label: 'Terms of Service', href: '/terms-of-service' },
              { label: 'Privacy Policy', href: '/privacy-policy' },
            ]
          ).map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-primary no-underline font-sans text-sm font-semibold hover:opacity-80 transition-opacity"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
};
