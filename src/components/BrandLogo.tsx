import { Link } from 'react-router-dom';

interface BrandLogoProps {
  to?: string;
  showText?: boolean;
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  onClick?: () => void;
}

export default function BrandLogo({
  to = '/',
  showText = true,
  className = '',
  logoClassName = 'w-14 h-14',
  textClassName = 'text-xl font-display font-bold text-gradient-animate tracking-tight',
  onClick,
}: BrandLogoProps) {
  return (
    <Link to={to} onClick={onClick} className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src="/images/logo.png"
        alt="Brader Real Estate"
        className={`shrink-0 ${logoClassName}`}
      />
      {showText && <span className={textClassName}>Brader Real Estate</span>}
    </Link>
  );
}
