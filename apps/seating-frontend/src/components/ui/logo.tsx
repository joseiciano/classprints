import LogoSvg from '@classprints/seating-shared/assets/logos/Letter-Circle-1x.svg';

export interface LogoProps {
  className?: string;
}

export function Logo({ className = 'h-16 w-auto' }: LogoProps) {
  return <img src={LogoSvg} alt="Logo" className={className} />;
}
