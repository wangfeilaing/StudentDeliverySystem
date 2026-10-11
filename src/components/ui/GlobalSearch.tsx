'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface SearchResult {
  id: number;
  name?: string;
  title?: string;
  type?: string;
  category?: string;
  avatar_path?: string | null;
  ip_name?: string;
  ip_id?: number;
  tags?: string;
  status?: string;
  real_name?: string;
  color?: string;
  group_name?: string;
  file_path?: string;
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ ips: SearchResult[]; tags: SearchResult[]; materials: SearchResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = async (q: string) => {
    if (!q.trim()) { setResults(null); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setOpen(true);
      }
    } catch {}
    setLoading(false);
  };

  const totalCount = results
    ? (results.ips?.length || 0) + (results.materials?.length || 0) + (results.tags?.length || 0)
    : 0;

  return (
    <div ref={ref} className="relative">
      <div className="relative group">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-gray-500 group-focus-within:rotate-12 transition-transform duration-300"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); doSearch(e.target.value); }}
          onFocus={() => { if (results) setOpen(true); }}
          placeholder="搜索 IP、素材、标签..."
          className="input-glass w-64 pl-9 pr-9"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults(null); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-600 hover:bg-black/5 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {loading && !query && (
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {loading && query && (
          <svg className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>

      {open && results && (
        <div className="absolute top-full mt-2 left-0 right-0 w-[400px] glass-card rounded-2xl shadow-xl z-50 max-h-[480px] overflow-y-auto">
          {totalCount === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-3">
              <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                <line x1="8" y1="8" x2="12" y2="12" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                <line x1="12" y1="8" x2="8" y2="12" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
              <p className="text-[13px] text-gray-500">未找到相关结果</p>
              <p className="text-[11px] text-gray-600">尝试其他关键词搜索</p>
            </div>
          ) : (
            <div>
              {results.ips.length > 0 && (
                <div className="px-3 pt-3 pb-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-[3px] h-3 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">IP</span>
                  </div>
                  {results.ips.map(ip => (
                    <Link key={`ip-${ip.id}`} href={`/ips/${ip.id}`} onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/5 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-600 flex-shrink-0">
                        {ip.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-700 truncate">{ip.name}</div>
                        <div className="text-[11px] text-gray-500">{ip.category || ip.real_name || ''}</div>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ip.status === 'active' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-black/5 text-gray-500'}`}>
                        {ip.status === 'active' ? '合作中' : ip.status === 'paused' ? '暂停' : '结束'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {results.materials.length > 0 && (
                <div className="px-3 pt-2 pb-1 border-t border-black/5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-[3px] h-3 rounded-full bg-cyan-400 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">素材</span>
                  </div>
                  {results.materials.slice(0, 5).map((m: any) => (
                    <Link key={`mat-${m.type}-${m.id}`} href={`/ips/${m.ip_id}`} onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/5 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-black/5 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={m.type === 'video' ? 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' : 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-700 truncate">{m.name || '未命名'}</div>
                        <div className="text-[11px] text-gray-500">{m.ip_name} · {m.type === 'video' ? '视频' : '截图'}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {results.tags.length > 0 && (
                <div className="px-3 pt-2 pb-3 border-t border-black/5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-[3px] h-3 rounded-full bg-amber-500 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">标签</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {results.tags.map(tag => (
                      <Link key={`tag-${tag.id}`} href="/tags" onClick={() => setOpen(false)}
                        className="px-2 py-1 rounded-lg text-[12px] font-medium hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: (tag.color || '#3b82f6') + '18', color: tag.color || '#3b82f6' }}>
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
