import Link from 'next/link';
import Badge from '@/components/ui/Badge';

interface IPItem {
  id: number; name: string; category: string; tags: string; status: string;
  avatar_path: string | null; account_count: number; screenshot_count: number; video_count: number;
}

const statusLabels: Record<string, { label: string; color: 'green' | 'yellow' | 'gray' }> = {
  active: { label: '合作中', color: 'green' },
  paused: { label: '暂停', color: 'yellow' },
  ended: { label: '已结束', color: 'gray' },
};

export default function IPCard({ ip }: { ip: IPItem }) {
  const tags = ip.tags ? ip.tags.split(',').filter(Boolean) : [];
  return (
    <Link href={`/ips/${ip.id}`} className="block group">
      <div className="glass-card p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-cyan-100 flex-shrink-0 overflow-hidden border border-slate-100">
            {ip.avatar_path ? (
              <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-emerald-500 text-lg font-bold">{ip.name.charAt(0)}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-gray-800 group-hover:text-emerald-600 transition-colors truncate">{ip.name}</h3>
            {ip.category && <Badge color="blue" className="mt-1">{ip.category}</Badge>}
            {ip.status && statusLabels[ip.status] && (
              <Badge color={statusLabels[ip.status].color} className="mt-1 ml-1">{statusLabels[ip.status].label}</Badge>
            )}
            <div className="flex gap-1 mt-2 flex-wrap">
              {tags.slice(0, 3).map(t => <Badge key={t}>{t.trim()}</Badge>)}
              {tags.length > 3 && <Badge>+{tags.length - 3}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-4 mt-4 pt-3 border-t border-slate-200 text-[12px] text-gray-500 font-medium">
          <span>{ip.account_count} 账号</span><span>{ip.screenshot_count} 截图</span><span>{ip.video_count} 视频</span>
        </div>
      </div>
    </Link>
  );
}
