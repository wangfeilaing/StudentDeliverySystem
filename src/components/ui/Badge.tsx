const solidColorMap: Record<string, string> = {
  blue: 'bg-emerald-500/15 text-emerald-700 border border-emerald-400/20',
  cyan: 'bg-cyan-500/15 text-cyan-700 border border-cyan-400/20',
  green: 'bg-emerald-500/15 text-emerald-700 border border-emerald-400/20',
  red: 'bg-red-500/15 text-red-600 border border-red-400/20',
  gray: 'bg-slate-500/15 text-gray-600 border border-slate-400/20',
  purple: 'bg-violet-500/15 text-violet-700 border border-violet-400/20',
  yellow: 'bg-amber-500/15 text-amber-700 border border-amber-400/20',
  orange: 'bg-orange-500/15 text-orange-700 border border-orange-400/20',
  teal: 'bg-teal-500/15 text-teal-700 border border-teal-400/20',
  pink: 'bg-pink-500/15 text-pink-700 border border-pink-400/20',
};

const outlineColorMap: Record<string, string> = {
  blue: 'bg-transparent text-emerald-700 border border-emerald-400/30',
  cyan: 'bg-transparent text-cyan-700 border border-cyan-400/30',
  green: 'bg-transparent text-emerald-700 border border-emerald-400/30',
  red: 'bg-transparent text-red-600 border border-red-400/30',
  gray: 'bg-transparent text-gray-600 border border-slate-400/30',
  purple: 'bg-transparent text-violet-700 border border-violet-400/30',
  yellow: 'bg-transparent text-amber-700 border border-amber-400/30',
  orange: 'bg-transparent text-orange-700 border border-orange-400/30',
  teal: 'bg-transparent text-teal-700 border border-teal-400/30',
  pink: 'bg-transparent text-pink-700 border border-pink-400/30',
};

const dotTextColorMap: Record<string, string> = {
  blue: 'text-emerald-700',
  cyan: 'text-cyan-700',
  green: 'text-emerald-700',
  red: 'text-red-600',
  gray: 'text-gray-600',
  purple: 'text-violet-700',
  yellow: 'text-amber-700',
  orange: 'text-orange-700',
  teal: 'text-teal-700',
  pink: 'text-pink-700',
};

const dotBgColorMap: Record<string, string> = {
  blue: 'bg-emerald-400',
  cyan: 'bg-cyan-400',
  green: 'bg-emerald-400',
  red: 'bg-red-400',
  gray: 'bg-slate-400',
  purple: 'bg-violet-400',
  yellow: 'bg-amber-400',
  orange: 'bg-orange-400',
  teal: 'bg-teal-400',
  pink: 'bg-pink-400',
};

const sizeMap: Record<string, string> = {
  sm: 'text-[11px] px-2 py-0.5 gap-1',
  md: 'text-[12px] px-2.5 py-1 gap-1.5',
};

interface Props {
  children: React.ReactNode;
  color?: string;
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'solid' | 'outline' | 'dot';
  removable?: boolean;
  onRemove?: () => void;
}

export default function Badge({
  children,
  color = 'gray',
  className = '',
  size = 'sm',
  variant = 'solid',
  removable = false,
  onRemove,
}: Props) {
  const isDot = variant === 'dot';
  const isOutline = variant === 'outline';

  const colorClasses = isOutline
    ? (outlineColorMap[color] || outlineColorMap.gray)
    : isDot
    ? (dotTextColorMap[color] || dotTextColorMap.gray)
    : (solidColorMap[color] || solidColorMap.gray);

  const sizeClasses = sizeMap[size] || sizeMap.sm;

  return (
    <span
      className={`inline-flex items-center rounded-lg font-semibold ${sizeClasses} ${isDot ? '' : colorClasses} ${className}`}
    >
      {isDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotBgColorMap[color] || dotBgColorMap.gray}`}
        />
      )}
      <span className={isDot ? colorClasses : ''}>{children}</span>
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-black/5 transition-colors flex-shrink-0"
          aria-label="Remove"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
