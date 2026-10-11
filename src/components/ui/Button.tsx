import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'subtle';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-600 text-white hover:from-emerald-500 hover:via-emerald-400 hover:to-cyan-500 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 active:scale-[0.98]',
  secondary: 'bg-white/70 text-gray-700 hover:bg-white/85 border border-white/70 hover:border-white/85 shadow-sm',
  danger: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700',
  ghost: 'text-gray-500 hover:text-gray-700 hover:bg-black/5',
  outline: 'bg-transparent text-emerald-600 border border-emerald-400/30 hover:bg-emerald-500/10 hover:border-emerald-400/50 shadow-[0_0_16px_rgba(16,185,129,0.06)]',
  subtle: 'bg-black/[0.03] text-gray-500 hover:bg-black/[0.06] hover:text-gray-600',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export default function Button({ variant = 'primary', size = 'md', loading, icon, className = '', children, disabled, ...props }: Props) {
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-[12px] gap-1.5 rounded-lg'
    : size === 'lg' ? 'px-6 py-3 text-[15px] gap-2.5 rounded-xl'
    : 'px-4 py-2.5 text-[13px] gap-2 rounded-xl';

  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${sizeClass} ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
