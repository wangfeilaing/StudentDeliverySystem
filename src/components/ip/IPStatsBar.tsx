interface Props { accountCount: number; screenshotCount: number; videoCount: number; }

export default function IPStatsBar({ accountCount, screenshotCount, videoCount }: Props) {
  const items = [
    { label: '账号', value: accountCount, gradient: 'from-emerald-100 to-emerald-50', text: 'text-emerald-600' },
    { label: '截图', value: screenshotCount, gradient: 'from-emerald-100 to-emerald-50', text: 'text-emerald-600' },
    { label: '视频', value: videoCount, gradient: 'from-purple-100 to-purple-50', text: 'text-purple-600' },
  ];
  return (
    <div className="flex gap-3">
      {items.map(item => (
        <div key={item.label} className={`flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-br ${item.gradient} border border-slate-200`}>
          <span className={`text-lg font-bold ${item.text}`}>{item.value}</span>
          <span className="text-[13px] text-gray-500 font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
