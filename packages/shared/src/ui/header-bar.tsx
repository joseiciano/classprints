import type { ReactNode } from 'react';

export interface HeaderBarProps {
  left: ReactNode;
  right?: ReactNode;
  fixed?: boolean;
  className?: string;
  navClassName?: string;
  leftClassName?: string;
  rightClassName?: string;
}

export const HeaderBar = ({
  left,
  right,
  fixed = true,
  className = '',
  navClassName = '',
  leftClassName = '',
  rightClassName = '',
}: HeaderBarProps) => {
  const positionClass = fixed ? 'absolute' : 'relative';
  const headerClasses = `top-0 left-0 right-0 z-50 ${className}`.trim();
  const navClasses =
    `relative z-50 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4 ${navClassName}`.trim();
  const leftClasses = `flex items-center gap-2 ${leftClassName}`.trim();
  const rightClasses = `flex items-center gap-4 ${rightClassName}`.trim();

  return (
    <header className={`${positionClass} ${headerClasses}`}>
      <nav className={navClasses}>
        <div className={leftClasses}>{left}</div>
        {right ? <div className={rightClasses}>{right}</div> : null}
      </nav>
    </header>
  );
};
