'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/lib/UserContext';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface IPItem {
  id: number; name: string; category: string; status: string;
  avatar_path: string | null; updated_at: string;
  account_count: number; material_count: number;
  service_tier: string; batch_number: string;
}

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreateClick: () => void;
}

const statusFilters = [
  { key: '', label: '全部' },
  { key: 'active', label: '活跃' },
  { key: 'incomplete', label: '待完善' },
  { key: 'paused', label: '停更' },
  { key: 'high_potential', label: '高潜力' },
  { key: 'with_materials', label: '有素材' },
];

const serviceTierFilters = [
  { key: '', label: '全部服务' },
  { key: '6980', label: '21 天训练营' },
  { key: '19800', label: '破局起飞计划' },
  { key: 'cooperation', label: '千万联盟' },
];

const serviceTierBadge: Record<string, { label: string; cls: string }> = {
  '6980': { label: '21天', cls: 'bg-blue-500/15 text-blue-600 border-blue-400/20' },
  '19800': { label: '破局', cls: 'bg-purple-500/15 text-purple-600 border-purple-400/20' },
  cooperation: { label: '联盟', cls: 'bg-amber-500/15 text-amber-600 border-amber-400/20' },
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  active: { label: '活跃', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-400/20' },
  paused: { label: '停更', cls: 'bg-amber-500/15 text-amber-400 border-amber-400/20' },
  ended: { label: '已结束', cls: 'bg-slate-500/15 text-gray-500 border-slate-400/20' },
  inactive: { label: '待维护', cls: 'bg-orange-500/15 text-orange-400 border-orange-400/20' },
};

export default function IPListSidebar({ selectedId, onSelect, onCreateClick }: Props) {
  const { user } = useUser();
  const router = useRouter();
  const [ips, setIps] = useState<IPItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceTierFilter, setServiceTierFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<IPItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ips/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setIps(prev => prev.filter(ip => ip.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) {
        onSelect(ips[0]?.id || 0);
      }
      setDeleteTarget(null);
    } catch {} finally { setDeleting(false); }
  };

  // Drag state
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasSelected = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (serviceTierFilter) params.set('service_tier', serviceTierFilter);
    if (batchFilter) params.set('batch_number', batchFilter);
    fetch(`/api/ips?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.items || []);
        setIps(list.map((item: Record<string, unknown>) => ({
          id: item.id as number,
          name: item.name as string,
          category: item.category as string,
          status: item.status as string,
          avatar_path: item.avatar_path as string | null,
          updated_at: item.updated_at as string,
          account_count: (item.account_count as number) || 0,
          material_count: ((item.screenshot_count as number) || 0) + ((item.video_count as number) || 0),
          service_tier: (item.service_tier as string) || '',
          batch_number: (item.batch_number as string) || '',
        })));
        if (list.length > 0 && !hasSelected.current) {
          hasSelected.current = true;
          onSelect((list[0] as Record<string, unknown>).id as number);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serviceTierFilter, batchFilter]);

  const filtered = ips.filter(ip => {
    const matchSearch = !search || ip.name.toLowerCase().includes(search.toLowerCase()) || ip.category.includes(search);
    const matchStatus = !statusFilter || ip.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const formatTime = (t: string) => {
    if (!t) return '';
    const d = new Date(t);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ---- Drag & Drop ----
  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
    setDragId(id);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  };

  const handleDragLeave = useCallback(() => {
    setDropIndex(null);
  }, []);

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData('text/plain'));
    if (isNaN(id)) return;

    setIps(prev => {
      const currentIndex = prev.findIndex(ip => ip.id === id);
      if (currentIndex === -1 || currentIndex === targetIndex) return prev;

      const next = [...prev];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);

      // Persist to backend
      const orderedIds = next.map(ip => ip.id);
      fetch('/api/ips/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      }).catch(() => {});

      return next;
    });

    setDragId(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDropIndex(null);
  };

  return (
    <div className="w-[320px] flex-shrink-0 h-full glass-sidebar flex flex-col">
      {/* User profile card */}
      <div className="px-4 pt-4 pb-3 border-b border-black/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
            {(user?.display_name || user?.username || '?').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-gray-700 truncate">{user?.display_name || user?.username}</div>
            <div className="text-[11px] text-gray-500">{ips.length} 个 IP · {ips.filter(i => i.status === 'active').length} 活跃</div>
          </div>
          <Link href="/settings" className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center text-gray-500 transition-colors" title="设置">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="relative group">
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-all duration-300 group-focus-within:text-emerald-600 group-focus-within:rotate-12 group-focus-within:scale-110 text-gray-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索学员、IP、标签..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-[13px] glass-page-card border border-black/10 text-gray-600 placeholder-gray-400 focus:outline-none focus:border-emerald-400/40 focus:bg-white/90 focus:shadow-[0_0_16px_rgba(16,185,129,0.06)] transition-all"
          />
        </div>
      </div>

      {/* Status filters */}
      <div className="px-3 pb-2 flex flex-wrap gap-1.5">
        {statusFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              statusFilter === f.key
                ? 'bg-emerald-500/15 text-emerald-700 shadow-[0_0_10px_rgba(16,185,129,0.08)] border border-emerald-400/25'
                : 'glass-page-card text-gray-500 hover:bg-black/5 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Service tier filters */}
      <div className="px-3 pb-2 flex flex-wrap gap-1.5">
        {serviceTierFilters.map(f => (
          <button
            key={f.key}
            onClick={() => { setServiceTierFilter(f.key); setBatchFilter(''); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              serviceTierFilter === f.key
                ? 'bg-gradient-to-r from-blue-500/15 to-purple-500/15 text-gray-800 shadow-[0_0_10px_rgba(99,102,241,0.08)] border border-indigo-400/25'
                : 'glass-page-card text-gray-500 hover:bg-black/5 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Batch filter — only for 21天训练营 */}
      {serviceTierFilter === '6980' && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {[{ key: '', label: '全部期数' }, { key: '第1期', label: '第1期' }, { key: '第2期', label: '第2期' }, { key: '第3期', label: '第3期' }].map(f => (
            <button
              key={f.key}
              onClick={() => setBatchFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                batchFilter === f.key
                  ? 'bg-amber-500/15 text-amber-700 shadow-[0_0_10px_rgba(245,158,11,0.08)] border border-amber-400/25'
                  : 'glass-page-card text-gray-500 hover:bg-black/5 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="border-b border-black/5 mx-3" />

      {/* IP List with drag & drop */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-2"
        onDragLeave={handleDragLeave}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-[13px]">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-[13px]">暂无匹配的 IP</p>
          </div>
        ) : (
          <div className="space-y-0.5 pb-2">
            {/* Drop indicator at top */}
            {dropIndex === 0 && (
              <div className="h-0.5 rounded-full bg-emerald-400 mx-3" />
            )}
            {filtered.map((ip, i) => {
              const selected = selectedId === ip.id;
              const badge = statusBadge[ip.status] || statusBadge.active;
              const isDragging = dragId === ip.id;

              return (
                <div key={ip.id}>
                  {/* Drop indicator above this item */}
                  {dropIndex === i && !isDragging && (
                    <div className="h-0.5 rounded-full bg-emerald-400 mx-3 mb-0.5" />
                  )}
                  <button
                    draggable
                    onDragStart={e => handleDragStart(e, ip.id)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDrop={e => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelect(ip.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all relative group ${
                      selected
                        ? 'bg-emerald-500/10 border border-emerald-400/15 shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                        : 'hover:bg-black/5 border border-transparent'
                    } ${isDragging ? 'opacity-40 scale-95' : ''}`}
                    style={isDragging ? { cursor: 'grabbing' } : undefined}
                  >
                    {/* Drag handle */}
                    <div
                      className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                      title="拖拽排序"
                    >
                      <svg className="w-3.5 h-3.5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
                      </svg>
                    </div>
                    {selected && <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-gradient-to-b from-emerald-400 via-cyan-400 to-emerald-500 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.4)]" />}
                    {/* Active pulse dot */}
                    {ip.status === 'active' && selected && (
                      <span className="absolute right-1 top-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse-glow" />
                    )}
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-sm font-bold text-emerald-600 flex-shrink-0 overflow-hidden border ${selected ? 'border-emerald-400/25 shadow-[0_0_12px_rgba(16,185,129,0.15)]' : 'border-black/10'}`}>
                      {ip.avatar_path ? (
                        <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-full h-full object-cover" />
                      ) : (
                        ip.name.charAt(0)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-gray-700 truncate">{ip.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ip.category && <span className="text-[10px] text-gray-500">{ip.category}</span>}
                        {ip.service_tier && serviceTierBadge[ip.service_tier] && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${serviceTierBadge[ip.service_tier].cls}`}>{serviceTierBadge[ip.service_tier].label}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                        <span>{ip.account_count} 账号</span>
                        <span>{ip.material_count} 素材</span>
                        <span>{formatTime(ip.updated_at)}</span>
                      </div>
                    </div>
                    {/* Delete button — visible on hover */}
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(ip); }}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-100 flex items-center justify-center flex-shrink-0 transition-all"
                      title="删除"
                    >
                      <svg className="w-3.5 h-3.5 text-red-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </button>
                </div>
              );
            })}
            {/* Drop indicator at bottom */}
            {dropIndex === filtered.length && (
              <div className="h-0.5 rounded-full bg-emerald-400 mx-3 mt-0.5" />
            )}
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div className="px-3 py-3 border-t border-black/5">
        <button
          onClick={onCreateClick}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-md shadow-emerald-500/15 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          新建 IP
        </button>
      </div>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除 IP"
        message={deleteTarget ? `确定要删除「${deleteTarget.name}」吗？该 IP 及其关联的截图、视频将被移入回收站。` : ''}
        loading={deleting}
      />
    </div>
  );
}
