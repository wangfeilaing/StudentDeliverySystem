import { ReactNode } from 'react';

type CardVariant = 'default' | 'elevated' | 'bordered' | 'hero';
type HoverMode = 'none' | 'lift' | 'glow';

interface Props {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  variant?: CardVariant;
  hover?: HoverMode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'glass-card',
  elevated: 'glass-elevated',
  bordered: 'glass-card border-accent',
  hero: 'glass-elevated p-7 border-glow animate-border-glow',
};

const hoverClasses: Record<HoverMode, string> = {
  none: '',
  lift: '',
  glow: 'hover:border-glow hover:shadow-[0_8px_36px_rgba(0,0,0,0.5),0_0_20px_rgba(16,185,129,0.08)]',
};

export default function Card({ children, className = '', title, icon, action, variant = 'default', hover = 'lift' }: Props) {
  const hoverClass = variant === 'default' && hover === 'lift' ? '' : hoverClasses[hover];
  const baseClass = variantClasses[variant];

  return (
    <div className={`${baseClass} ${hoverClass} ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-black/5">
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-gray-500">{icon}</span>}
            <h3 className="text-[14px] font-semibold text-gray-700">{title}</h3>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
