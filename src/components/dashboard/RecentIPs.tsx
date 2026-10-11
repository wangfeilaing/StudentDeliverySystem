import Link from 'next/link';

interface IPItem {
  id: number;
  name: string;
  category: string;
  avatar_path: string | null;
  created_at: string;
}

export default function RecentIPs({ ips }: { ips: IPItem[] }) {
  if (ips.length === 0) {
    return <p className="text-[13px] text-muted py-8 text-center">还没有 IP，点击左侧「新建 IP」开始</p>;
  }

  return (
    <div className="divide-y divide-border">
      {ips.map((ip) => (
        <Link
          key={ip.id}
          href={`/ips/${ip.id}`}
          className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-md hover:bg-muted-light transition-colors"
        >
          <div className="w-9 h-9 rounded-md bg-muted-light overflow-hidden flex-shrink-0">
            {ip.avatar_path ? (
              <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted text-sm font-bold">
                {ip.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-foreground truncate">{ip.name}</div>
            {ip.category && <div className="text-[12px] text-muted">{ip.category}</div>}
          </div>
          <span className="text-[11px] text-muted">{ip.created_at.slice(0, 10)}</span>
        </Link>
      ))}
    </div>
  );
}
