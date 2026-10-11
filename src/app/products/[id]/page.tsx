'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface IPInfo {
  id: number; name: string; status: string; avatar_path: string | null;
  course_start_date: string; service_tier: string; updated_at: string;
  total_tasks: number; completed_tasks: number; progress: number;
}

interface BatchInfo {
  batch_number: string; ips: IPInfo[];
  ip_count: number; total_tasks: number; completed_tasks: number; progress: number;
}

interface ProductDetail {
  product: { id: number; name: string; price: number; service_days: number; description: string; status: string };
  batches: BatchInfo[];
  total_ips: number; total_tasks: number; completed_tasks: number; progress: number;
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  active: { label: '活跃', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-400/20' },
  paused: { label: '停更', cls: 'bg-amber-500/15 text-amber-400 border-amber-400/20' },
  ended: { label: '已结束', cls: 'bg-slate-500/15 text-gray-500 border-slate-400/20' },
  inactive: { label: '待维护', cls: 'bg-orange-500/15 text-orange-400 border-orange-400/20' },
};

export default function ProductDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/products/${id}/ips`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const progressColor = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 40) return 'bg-cyan-500';
    if (pct > 0) return 'bg-amber-500';
    return 'bg-gray-200';
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-500 text-[13px]">加载中...</div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center py-20 text-gray-500 text-[13px]">产品不存在</div>;
  }

  const { product, batches, total_ips, total_tasks, completed_tasks, progress } = data;

  return (
    <div className="animate-fade-up space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/products" className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center text-gray-500 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="text-[20px] font-bold text-gray-800">{product.name}</h2>
          <p className="text-[13px] text-gray-500">¥{product.price.toLocaleString()} / {product.service_days}天</p>
        </div>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <div className="text-[24px] font-bold text-gray-800">{total_ips}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">学员总数</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-[24px] font-bold text-gray-800">{batches.length}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">开班期数</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-[24px] font-bold text-gray-800">{completed_tasks}/{total_tasks}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">完成任务</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-[24px] font-bold text-emerald-600">{progress}%</div>
          <div className="text-[11px] text-gray-500 mt-0.5">整体进度</div>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-gray-700">整体交付进度</span>
          <span className="text-[12px] text-gray-500">{completed_tasks}/{total_tasks} 任务</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${progressColor(progress)}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Batches */}
      {batches.map(batch => (
        <div key={batch.batch_number} className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[16px] font-bold text-gray-800">{batch.batch_number}</h3>
              <p className="text-[12px] text-gray-500">
                {batch.ip_count} 人{/* show first IP's course_start_date as batch start if available */}{batch.ips[0]?.course_start_date ? ` · ${batch.ips[0].course_start_date} 开课` : ''}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[18px] font-bold text-emerald-600">{batch.progress}%</div>
              <div className="text-[11px] text-gray-500">{batch.completed_tasks}/{batch.total_tasks} 任务</div>
            </div>
          </div>

          {/* Batch progress bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className={`h-full rounded-full transition-all duration-500 ${progressColor(batch.progress)}`} style={{ width: `${batch.progress}%` }} />
          </div>

          {/* IP list */}
          <div className="space-y-2">
            {batch.ips.map(ip => (
              <Link
                key={ip.id}
                href={`/ips/${ip.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 transition-colors group"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-xs font-bold text-emerald-600 flex-shrink-0 overflow-hidden border border-black/10">
                  {ip.avatar_path ? (
                    <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-full h-full object-cover" />
                  ) : (
                    ip.name.charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-gray-700 truncate">{ip.name}</span>
                    {statusBadge[ip.status] && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${statusBadge[ip.status].cls}`}>
                        {statusBadge[ip.status].label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 max-w-[160px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${progressColor(ip.progress)}`} style={{ width: `${ip.progress}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-500">{ip.completed_tasks}/{ip.total_tasks}</span>
                    <span className="text-[11px] font-medium text-gray-700">{ip.progress}%</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {batches.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-[13px]">暂无学员</div>
      )}
    </div>
  );
}
