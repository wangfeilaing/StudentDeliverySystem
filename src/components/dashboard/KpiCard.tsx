import Sparkline from './Sparkline';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  change?: number;
  icon: string;
  color: 'emerald' | 'cyan' | 'amber' | 'orange' | 'red';
  sparklineData?: number[];
}

const colorMap: Record<string, { bg: string; text: string; glow: string }> = {
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', glow: '#10b981' },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-600', glow: '#06b6d4' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600', glow: '#f59e0b' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600', glow: '#f97316' },
  red: { bg: 'bg-red-100', text: 'text-red-600', glow: '#ef4444' },
};

export default function KpiCard({ label, value, sub, change, icon, color, sparklineData }: Props) {
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className="glass-dashboard-card-emphasis p-4 animate-fade-up">
      <div className="flex items-start justify-between mb-1.5">
        <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
          <svg className={`w-[16px] h-[16px] ${c.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={icon} />
          </svg>
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} color={c.glow} />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-bold text-gray-800 tracking-tight">{value}</span>
        {change !== undefined && (
          <span className={`text-[12px] font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <div className="text-[12px] font-medium text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
