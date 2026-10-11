interface Props {
  label: string;
  value: number | string;
  icon: string;
  color: string;
}

const colorMap: Record<string, string> = {
  red: 'bg-primary-light text-primary-dark',
  green: 'bg-green-50 text-green-700',
  purple: 'bg-purple-50 text-purple-700',
  orange: 'bg-orange-50 text-orange-700',
  pink: 'bg-pink-50 text-pink-700',
};

export default function StatCard({ label, value, icon, color }: Props) {
  const colorClass = colorMap[color] || colorMap.red;
  return (
    <div className="card-ms p-5">
      <div className="flex items-center gap-3.5">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-lg ${colorClass}`}>
          {icon}
        </div>
        <div>
          <div className="text-[22px] font-bold text-foreground leading-none mb-1">{value}</div>
          <div className="text-[12px] text-muted font-medium">{label}</div>
        </div>
      </div>
    </div>
  );
}
