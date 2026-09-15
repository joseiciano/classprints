import { ReactNode } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'mint' | 'lavender' | 'playful' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const variantStyles = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  ghost: 'hover:bg-accent/20 text-foreground',
  mint: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
  lavender: 'bg-accent text-accent-foreground hover:bg-accent/90',
  playful: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-border bg-transparent hover:bg-accent/10 text-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const sizeStyles = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    'rounded-xl font-semibold transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2';
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <button className={`${baseStyles} ${variantStyle} ${sizeStyle} ${className}`} {...props}>
      {children}
    </button>
  );
}
