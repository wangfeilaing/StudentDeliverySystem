'use client';
import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';

interface ContentItem {
  id: number;
  source_type: string;
  platform: string;
  author: string;
  author_url: string;
  title: string;
  original_text: string;
  transcript: string;
  rewritten_text: string;
  digg_count: number;
  video_url: string;
  download_url: string;
  status: string;
  feishu_doc_url: string;
  notes: string;
  created_at: string;
}

interface SourceCount { source_type: string; c: number; }

interface AiModel {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  is_default: number;
  status: string;
  key_set: boolean;
  key_hint: string;
}

// 常见模型预设（点选后自动填 base_url / 模型名，用户只需填 Key）
const MODEL_PRESETS: { label: string; provider: string; base_url: string; model: string; hint: string }[] = [
  { label: 'DeepSeek', provider: 'openai', base_url: 'https://api.deepseek.com', model: 'deepseek-chat', hint: '国内可直连，便宜，中文好' },
  { label: '通义千问', provider: 'openai', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', hint: '阿里，兼容模式' },
  { label: '豆包(方舟)', provider: 'openai', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: '填入推理接入点ID', hint: '字节，model 填接入点ID' },
  { label: 'Kimi(月之暗面)', provider: 'openai', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hint: '' },
  { label: 'OpenAI (GPT)', provider: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-4o', hint: '需科学上网' },
  { label: 'Claude Opus 4.8（分析推荐）', provider: 'anthropic', base_url: 'https://api.anthropic.com', model: 'claude-opus-4-8', hint: '质量最高，适合账号深度分析；需科学上网+海外付费' },
  { label: 'Claude Sonnet 4.6', provider: 'anthropic', base_url: 'https://api.anthropic.com', model: 'claude-sonnet-4-6', hint: '比 Opus 便宜些；需科学上网' },
  { label: '自定义', provider: 'openai', base_url: '', model: '', hint: '手动填写' },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动导入',
  douyin_profile: '主页提取',
  douyin_batch: '批量采集',
  douyin_search: '关键词搜索',
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'gray' },
  transcribed: { label: '已转写', color: 'cyan' },
  rewritten: { label: '已改写', color: 'purple' },
  exported: { label: '已导出', color: 'green' },
};

// 采集入口卡片
const COLLECT_MODES = [
  { mode: 'douyin_profile', label: '主页提取', desc: '输入一个博主主页，提取其全部视频文案', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { mode: 'douyin_batch', label: '批量采集', desc: '一次粘贴多个博主链接，批量抓取', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { mode: 'douyin_search', label: '关键词搜索', desc: '按关键词搜索博主/视频，按点赞筛选', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
];

export default function ContentStudioPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [counts, setCounts] = useState<SourceCount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // 筛选
  const [source, setSource] = useState('');
  const [minDigg, setMinDigg] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'digg' | 'newest'>('digg');

  // 选择
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // 模型
  const [models, setModels] = useState<AiModel[]>([]);

  // 弹窗
  const [importOpen, setImportOpen] = useState(false);
  const [collectMode, setCollectMode] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContentItem | null>(null);
  const [modelMgrOpen, setModelMgrOpen] = useState(false);

  // 提示
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const toast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ sort, limit: '100' });
      if (source) qs.set('source', source);
      if (minDigg) qs.set('minDigg', minDigg);
      if (search) qs.set('q', search);
      const res = await fetch(`/api/content?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setItems(data.items || []);
      setCounts(data.counts || []);
      setTotal(data.total || 0);
      setSelected(new Set());
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [source, minDigg, search, sort]);

  useEffect(() => { load(); }, [load]);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-models');
      const data = await res.json();
      if (res.ok) setModels(data.items || []);
    } catch { /* 忽略 */ }
  }, []);
  useEffect(() => { loadModels(); }, [loadModels]);

  const totalCount = counts.reduce((s, c) => s + c.c, 0);
  const countOf = (st: string) => counts.find(c => c.source_type === st)?.c || 0;

  const toggleSel = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const exportToFeishu = async (ids: number[]) => {
    if (ids.length === 0) return;
    toast(`正在写入飞书（${ids.length} 条）…`);
    try {
      const res = await fetch('/api/content/to-feishu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '写入失败');
      toast(`已写入飞书：${data.count} 条`);
      if (data.url) window.open(data.url, '_blank');
      load();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const removeItem = async (id: number) => {
    if (!confirm('确定删除这条文案吗？')) return;
    try {
      const res = await fetch(`/api/content/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '删除失败'); }
      toast('已删除');
      load();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* 顶部提示条 */}
      {msg && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg ${msg.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>
          {msg.text}
        </div>
      )}

      {/* 标题 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-bold text-gray-800">内容工坊</h1>
          <p className="text-[12px] text-gray-500 mt-1">采集爆款文案 → 转写 / AI 改写 → 一键写入飞书</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setModelMgrOpen(true)} icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          }>模型设置{models.length ? ` (${models.length})` : ''}</Button>
          <Button onClick={() => setImportOpen(true)} icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          }>手动导入</Button>
        </div>
      </div>

      {/* 采集入口 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {COLLECT_MODES.map(m => (
          <button key={m.mode} onClick={() => setCollectMode(m.mode)}
            className="glass-card text-left p-4 hover:border-glow transition-all duration-300 group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={m.icon} /></svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-gray-800">{m.label}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{m.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 筛选条 */}
      <div className="glass-card p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* 来源筛选 */}
          <div className="flex items-center gap-1 flex-wrap">
            <FilterTab active={source === ''} onClick={() => setSource('')} label="全部" count={totalCount} />
            {Object.keys(SOURCE_LABELS).map(st => (
              <FilterTab key={st} active={source === st} onClick={() => setSource(st)} label={SOURCE_LABELS[st]} count={countOf(st)} />
            ))}
          </div>
          <div className="flex-1" />
          {/* 最低点赞 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-gray-500">点赞≥</span>
            <input type="number" value={minDigg} onChange={e => setMinDigg(e.target.value)} placeholder="0"
              className="w-20 px-2 py-1.5 text-[12px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
          </div>
          {/* 搜索 */}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索博主/标题/文案…"
            className="w-48 px-3 py-1.5 text-[12px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
          {/* 排序 */}
          <select value={sort} onChange={e => setSort(e.target.value as 'digg' | 'newest')}
            className="px-2 py-1.5 text-[12px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400">
            <option value="digg">按点赞排序</option>
            <option value="newest">按时间排序</option>
          </select>
        </div>
      </div>

      {/* 批量操作条 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/20">
          <span className="text-[13px] text-emerald-700 font-medium">已选 {selected.size} 条</span>
          <Button size="sm" onClick={() => exportToFeishu([...selected])}>批量写入飞书</Button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-gray-500 hover:text-gray-700">取消选择</button>
        </div>
      )}

      {/* 列表 */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide border-b border-black/5">
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-emerald-500" /></th>
              <th className="px-2 py-3 w-28">博主</th>
              <th className="px-2 py-3">标题 / 文案</th>
              <th className="px-2 py-3 w-20 text-right">点赞</th>
              <th className="px-2 py-3 w-24">来源</th>
              <th className="px-2 py-3 w-20">状态</th>
              <th className="px-2 py-3 w-44 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">加载中…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                还没有文案。点上方「手动导入」先放几条进来，跑通改写和写飞书流程。
              </td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-black/[0.03] hover:bg-black/[0.02]">
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSel(item.id)} className="accent-emerald-500" /></td>
                <td className="px-2 py-3 text-gray-600 truncate max-w-[7rem]">{item.author || '—'}</td>
                <td className="px-2 py-3">
                  <button onClick={() => setDetail(item)} className="text-left hover:text-emerald-600 transition-colors">
                    <div className="font-medium text-gray-800 truncate max-w-[34rem]">{item.title || '未命名文案'}</div>
                    <div className="text-[11px] text-gray-400 truncate max-w-[34rem]">{item.rewritten_text || item.original_text || '（无正文）'}</div>
                  </button>
                </td>
                <td className="px-2 py-3 text-right text-gray-600 tabular-nums">{item.digg_count ? item.digg_count.toLocaleString() : '—'}</td>
                <td className="px-2 py-3"><span className="text-[11px] text-gray-500">{SOURCE_LABELS[item.source_type] || item.source_type}</span></td>
                <td className="px-2 py-3"><Badge color={STATUS_META[item.status]?.color || 'gray'} size="sm">{STATUS_META[item.status]?.label || item.status}</Badge></td>
                <td className="px-2 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setDetail(item)} className="px-2 py-1 text-[12px] text-gray-600 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors">详情/改写</button>
                    <button onClick={() => exportToFeishu([item.id])} className="px-2 py-1 text-[12px] text-gray-600 hover:text-cyan-600 hover:bg-cyan-500/10 rounded-lg transition-colors">写飞书</button>
                    <button onClick={() => removeItem(item.id)} className="px-2 py-1 text-[12px] text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">共 {total} 条{minDigg ? `（点赞≥${minDigg}）` : ''}</p>

      {/* 手动导入弹窗 */}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={(n) => { setImportOpen(false); toast(`已导入 ${n} 条`); load(); }} onError={(m) => toast(m, 'err')} />}

      {/* 采集弹窗 */}
      {collectMode && <CollectModal mode={collectMode} onClose={() => setCollectMode(null)} onToast={toast} onDone={() => { setCollectMode(null); load(); }} />}

      {/* 详情/改写弹窗 */}
      {detail && <DetailModal item={detail} models={models} onClose={() => setDetail(null)} onSaved={() => { setDetail(null); load(); }} onToast={toast} onExport={(id) => exportToFeishu([id])} onManageModels={() => setModelMgrOpen(true)} />}

      {/* 模型设置弹窗 */}
      {modelMgrOpen && <ModelManagerModal models={models} onClose={() => setModelMgrOpen(false)} onChanged={loadModels} onToast={toast} />}
    </div>
  );
}

function FilterTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${active ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-400/20' : 'text-gray-500 hover:bg-black/5 border border-transparent'}`}>
      {label} <span className="opacity-60">{count}</span>
    </button>
  );
}

// ---- 手动导入弹窗 ----
function ImportModal({ onClose, onDone, onError }: { onClose: () => void; onDone: (n: number) => void; onError: (m: string) => void }) {
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const lines = text.split(/\n\s*\n|\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { onError('请粘贴至少一条文案'); return; }
    const items = lines.map(line => ({
      source_type: 'manual',
      author: author.trim(),
      original_text: line,
      title: line.slice(0, 30),
    }));
    setBusy(true);
    try {
      const res = await fetch('/api/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '导入失败');
      onDone(data.inserted);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="手动导入文案" size="lg">
      <div className="space-y-3">
        <div>
          <label className="text-[12px] text-gray-500">博主名（可选，统一应用到本批）</label>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="例如：某某博主"
            className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
        </div>
        <div>
          <label className="text-[12px] text-gray-500">文案内容（每行一条，或用空行分隔多段）</label>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={10} placeholder={'把抖音文案粘贴到这里，一行一条…'}
            className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400 resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button loading={busy} onClick={submit}>导入</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- 采集弹窗（真实浏览器抓取）----
function CollectModal({ mode, onClose, onToast, onDone }: {
  mode: string; onClose: () => void; onToast: (m: string, t?: 'ok' | 'err') => void; onDone: () => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [minDigg, setMinDigg] = useState('1000');
  const [maxItems, setMaxItems] = useState('60');
  const [busy, setBusy] = useState(false);
  const label = SOURCE_LABELS[mode] || '采集';
  const isSearch = mode === 'douyin_search';
  const isBatch = mode === 'douyin_batch';

  const start = async () => {
    if (!keyword.trim()) { onToast(isSearch ? '请填写搜索关键词' : '请填写博主主页链接', 'err'); return; }
    setBusy(true);
    onToast('采集中…首次会弹出浏览器，请扫码登录并完成验证，耐心等待 1-2 分钟');
    try {
      const res = await fetch('/api/content/collect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, keyword: keyword.trim(), minDigg: Number(minDigg) || 0, maxItems: Number(maxItems) || 60 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '采集失败');
      onToast(data.message || `采集完成：新增 ${data.inserted} 条`, data.inserted ? 'ok' : 'err');
      if (data.inserted) onDone();
    } catch (e) {
      onToast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`抖音 · ${label}`} size="md">
      <div className="space-y-3">
        <div className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-400/20 text-[12px] text-cyan-700 leading-relaxed">
          采集会在本机打开一个真实浏览器去抖音抓取。<b>首次需用抖音扫码登录一次</b>（之后免登）；遇到滑块验证请在弹窗里完成。整个过程约 1-2 分钟，请勿关闭窗口。
        </div>
        <div>
          <label className="text-[12px] text-gray-500">{isSearch ? '搜索关键词' : isBatch ? '博主主页链接（可多行，一行一个）' : '博主主页链接'}</label>
          {isBatch ? (
            <textarea value={keyword} onChange={e => setKeyword(e.target.value)} rows={4}
              placeholder={'每行粘贴一个抖音博主主页链接'}
              className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400 resize-none" />
          ) : (
            <input value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder={isSearch ? '例如：健身 减脂' : '粘贴抖音博主主页链接'}
              className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[12px] text-gray-500">只要点赞 ≥</label>
            <input type="number" value={minDigg} onChange={e => setMinDigg(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
          </div>
          <div>
            <label className="text-[12px] text-gray-500">最多采集条数</label>
            <input type="number" value={maxItems} onChange={e => setMaxItems(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button loading={busy} onClick={start}>开始采集</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- 模型设置弹窗 ----
function ModelManagerModal({ models, onClose, onChanged, onToast }: {
  models: AiModel[]; onClose: () => void; onChanged: () => void; onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [adding, setAdding] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [baseUrl, setBaseUrl] = useState(MODEL_PRESETS[0].base_url);
  const [model, setModel] = useState(MODEL_PRESETS[0].model);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const applyPreset = (idx: number) => {
    setPresetIdx(idx);
    const p = MODEL_PRESETS[idx];
    setProvider(p.provider);
    setBaseUrl(p.base_url);
    setModel(p.model);
    if (p.label !== '自定义' && !name) setName(p.label);
  };

  const submit = async () => {
    if (!name.trim() || !model.trim()) { onToast('请填写名称和模型名', 'err'); return; }
    if (!apiKey.trim()) { onToast('请填写 API Key', 'err'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/ai-models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, provider, base_url: baseUrl, model, api_key: apiKey, is_default: models.length === 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加失败');
      onToast('已添加模型');
      setAdding(false); setName(''); setApiKey('');
      onChanged();
    } catch (e) {
      onToast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const test = async (id: number) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/ai-models/${id}/test`, { method: 'POST' });
      const data = await res.json();
      onToast(res.ok ? `连接正常：${(data.reply || '').slice(0, 20)}` : (data.error || '测试失败'), res.ok ? 'ok' : 'err');
    } catch (e) {
      onToast((e as Error).message, 'err');
    } finally {
      setTestingId(null);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('删除这个模型配置？')) return;
    try {
      const res = await fetch(`/api/ai-models/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '删除失败'); }
      onToast('已删除');
      onChanged();
    } catch (e) {
      onToast((e as Error).message, 'err');
    }
  };

  return (
    <Modal open onClose={onClose} title="模型设置" size="lg">
      <div className="space-y-4">
        {/* 已配置列表 */}
        <div className="space-y-2">
          {models.length === 0 && <p className="text-[13px] text-gray-400 text-center py-4">还没有配置模型。在下方添加一个，填入各家平台的 API Key 即可。</p>}
          {models.map(m => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/60 border border-black/5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-gray-800">{m.name}</span>
                  <Badge color={m.provider === 'anthropic' ? 'purple' : 'cyan'} size="sm">{m.provider === 'anthropic' ? 'Claude格式' : 'OpenAI格式'}</Badge>
                  {!!m.is_default && <Badge color="green" size="sm">默认</Badge>}
                  {!m.key_set && <Badge color="red" size="sm">缺Key</Badge>}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{m.model} · {m.key_hint || '未配置'}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="sm" variant="secondary" loading={testingId === m.id} onClick={() => test(m.id)}>测试</Button>
                <button onClick={() => remove(m.id)} className="px-2 py-1 text-[12px] text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg">删除</button>
              </div>
            </div>
          ))}
        </div>

        {/* 添加 */}
        {!adding ? (
          <Button variant="outline" onClick={() => setAdding(true)}>+ 添加模型</Button>
        ) : (
          <div className="space-y-2.5 p-3 rounded-xl bg-black/[0.02] border border-black/5">
            <div>
              <label className="text-[12px] text-gray-500">选择平台（自动填好地址，你只需填 Key）</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {MODEL_PRESETS.map((p, i) => (
                  <button key={p.label} onClick={() => applyPreset(i)}
                    className={`px-2.5 py-1 text-[12px] rounded-lg border transition-all ${presetIdx === i ? 'bg-emerald-500/15 text-emerald-700 border-emerald-400/30' : 'bg-white/60 text-gray-600 border-black/10 hover:bg-white'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {MODEL_PRESETS[presetIdx].hint && <p className="text-[11px] text-gray-400 mt-1">{MODEL_PRESETS[presetIdx].hint}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="显示名（如 DeepSeek）"
                className="px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="模型名 / ID"
                className="px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
            </div>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="接口地址 base_url"
              className="w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="API Key（加密存储，不回显）"
              className="w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdding(false)}>取消</Button>
              <Button loading={busy} onClick={submit}>保存</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---- 详情 / 改写弹窗 ----
function DetailModal({ item, models, onClose, onSaved, onToast, onExport, onManageModels }: {
  item: ContentItem; models: AiModel[]; onClose: () => void; onSaved: () => void;
  onToast: (m: string, t?: 'ok' | 'err') => void; onExport: (id: number) => void; onManageModels: () => void;
}) {
  const [original, setOriginal] = useState(item.original_text);
  const [rewritten, setRewritten] = useState(item.rewritten_text);
  const [busy, setBusy] = useState(false);
  const [rewriting, setRewriting] = useState(false);

  const usableModels = models.filter(m => m.key_set && m.status === 'active');
  const [modelId, setModelId] = useState<number>(() => {
    const saved = Number(typeof window !== 'undefined' ? localStorage.getItem('content_model_id') : 0);
    return saved || usableModels.find(m => m.is_default)?.id || usableModels[0]?.id || 0;
  });

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_text: original, rewritten_text: rewritten }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onToast('已保存');
      onSaved();
    } catch (e) {
      onToast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  // 语音转写仍为占位（第三期接 Whisper）
  const callTranscribe = async () => {
    try {
      const res = await fetch(`/api/content/${item.id}/transcribe`, { method: 'POST' });
      const data = await res.json();
      onToast(data.error || '功能待接入', 'err');
    } catch (e) {
      onToast((e as Error).message, 'err');
    }
  };

  // AI 改写（真实调用所选模型）
  const runRewrite = async () => {
    if (!modelId) { onToast('请先选择一个模型（没有就点右上角“模型设置”添加）', 'err'); return; }
    if (!original.trim()) { onToast('原文为空，无法改写', 'err'); return; }
    setRewriting(true);
    try {
      localStorage.setItem('content_model_id', String(modelId));
      // 先把当前编辑中的原文保存，确保改写用的是最新内容
      await fetch(`/api/content/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_text: original }),
      });
      const res = await fetch(`/api/content/${item.id}/rewrite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '改写失败');
      setRewritten(data.rewritten);
      onToast('改写完成');
    } catch (e) {
      onToast((e as Error).message, 'err');
    } finally {
      setRewriting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={item.title || '文案详情'} size="xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[12px] text-gray-500">
          <span>博主：{item.author || '—'}</span>
          <span>·</span>
          <span>点赞：{item.digg_count.toLocaleString()}</span>
          <span>·</span>
          <span>来源：{SOURCE_LABELS[item.source_type] || item.source_type}</span>
          {item.video_url && <><span>·</span><a href={item.video_url} target="_blank" className="text-emerald-600 hover:underline">原视频</a></>}
          {item.feishu_doc_url && <><span>·</span><a href={item.feishu_doc_url} target="_blank" className="text-cyan-600 hover:underline">飞书文档</a></>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[12px] font-medium text-gray-600">原始文案</label>
              <button onClick={callTranscribe} className="text-[11px] text-gray-400 hover:text-emerald-600">从视频语音转写 ›</button>
            </div>
            <textarea value={original} onChange={e => setOriginal(e.target.value)} rows={12}
              className="w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400 resize-none" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="text-[12px] font-medium text-gray-600">改写后文案</label>
              <div className="flex items-center gap-1.5">
                {usableModels.length > 0 ? (
                  <select value={modelId} onChange={e => setModelId(Number(e.target.value))}
                    className="px-2 py-1 text-[11px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400 max-w-[9rem]">
                    {usableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <button onClick={onManageModels} className="text-[11px] text-amber-600 hover:underline">未配置模型，去添加 ›</button>
                )}
                <Button size="sm" variant="outline" loading={rewriting} disabled={usableModels.length === 0} onClick={runRewrite}>AI 改写</Button>
              </div>
            </div>
            <textarea value={rewritten} onChange={e => setRewritten(e.target.value)} rows={12} placeholder="改写后的文案（可手动编辑，或第二期接入模型自动生成）"
              className="w-full px-3 py-2 text-[13px] rounded-lg bg-white/70 border border-black/10 focus:outline-none focus:border-emerald-400 resize-none" />
          </div>
        </div>

        <div className="flex justify-between items-center pt-1">
          <Button variant="secondary" onClick={() => onExport(item.id)}>写入飞书</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>关闭</Button>
            <Button loading={busy} onClick={save}>保存</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
