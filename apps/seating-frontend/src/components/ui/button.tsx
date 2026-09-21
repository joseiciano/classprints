import { ReactNode } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'mint' | 'lavender' | 'playful' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const variantStyles = {
  primary:
    'border border-primary bg-primary text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80',
  ghost: 'border border-transparent bg-transparent text-foreground hover:bg-muted',
  mint: 'border border-line-2 bg-transparent text-foreground hover:bg-muted',
  lavender: 'border border-line-2 bg-muted text-foreground hover:bg-pine-soft',
  playful:
    'border border-primary bg-primary text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80',
  outline: 'border border-line-2 bg-transparent text-foreground hover:bg-muted',
  destructive:
    'border border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/85',
};

const sizeStyles = {
  sm: 'min-h-9 px-3.5 py-1.5 text-[13px]',
  md: 'min-h-11 px-5 py-2.5 text-sm',
  lg: 'min-h-11 px-6 py-3 text-[15px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <button className={`${baseStyles} ${variantStyle} ${sizeStyle} ${className}`} {...props}>
      {children}
    </button>
  );
}
