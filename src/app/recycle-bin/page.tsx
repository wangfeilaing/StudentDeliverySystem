'use client';
import { useState, useEffect } from 'react';
import Tabs from '@/components/ui/Tabs';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface DeletedItem {
  id: number;
  title?: string;
  name?: string;
  ip_name?: string;
  file_path?: string;
  deleted_at: string;
}

export default function RecycleBinPage() {
  const [tab, setTab] = useState('screenshot');
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<DeletedItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeletedItem | null>(null);
  // 彻底删除前先取「会连带删掉什么」，避免客户档案被静默清空
  const [impact, setImpact] = useState<Record<string, number> | null>(null);
  const [fileCount, setFileCount] = useState(0);

  const loadItems = (type: string) => {
    setLoading(true);
    fetch(`/api/recycle-bin?type=${type}`)
      .then(r => r.json()).then(setItems)
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadItems(tab); }, [tab]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    await fetch(`/api/recycle-bin/${tab}/${restoreTarget.id}`, { method: 'POST' });
    setRestoreTarget(null); loadItems(tab);
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    // confirm=1 才会真正执行；不带时后端只回报影响面
    await fetch(`/api/recycle-bin/${tab}/${deleteTarget.id}?confirm=1`, { method: 'DELETE' });
    setDeleteTarget(null); setImpact(null); setFileCount(0); loadItems(tab);
  };

  // 点「彻底删除」时先拉取影响面
  const openDeleteDialog = async (item: DeletedItem) => {
    setDeleteTarget(item);
    setImpact(null);
    setFileCount(0);
    if (tab !== 'ip') return;
    try {
      const res = await fetch(`/api/recycle-bin/ip/${item.id}`);
      if (res.ok) {
        const data = await res.json();
        setImpact(data.impact || {});
        setFileCount(data.fileCount || 0);
      }
    } catch { /* 取不到影响面时仍允许删除，但文案会提示未知 */ }
  };

  // 把影响面拼成给人看的一句话
  const describeImpact = () => {
    if (!deleteTarget) return '';
    if (tab !== 'ip') {
      return `确定要彻底删除「${getTitle(deleteTarget)}」吗？此操作不可撤销！`;
    }

    const parts = Object.entries(impact || {}).map(([k, v]) => `${k} ${v} 条`);
    const filePart = fileCount > 0 ? `，以及 ${fileCount} 个已上传文件` : '';
    if (parts.length === 0) {
      return `「${getTitle(deleteTarget)}」名下没有关联记录${filePart}。彻底删除后不可撤销！`;
    }
    return `彻底删除「${getTitle(deleteTarget)}」会同时永久清除它名下的：${parts.join('、')}${filePart}。此操作不可撤销！`;
  };

  const tabs = [
    { key: 'screenshot', label: '截图' },
    { key: 'video', label: '视频' },
    { key: 'ip', label: 'IP' },
  ];

  const getTitle = (item: DeletedItem) => {
    if (tab === 'ip') return item.name || '未命名 IP';
    return item.title || '无标题';
  };

  return (
    <div className="animate-fade-up">
      <h1 className="text-[22px] font-bold text-gray-800 mb-2">回收站</h1>
      <p className="text-[13px] text-gray-500 mb-6">已删除的项目将在此保留 30 天，之后会自动清理。</p>

      <div className="glass-card p-5">
        <div className="flex border-b border-black/5 mb-4">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setItems([]); }}
              className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t.key ? 'text-gray-800' : 'text-gray-500 hover:text-gray-600'
              }`}>
              {t.label}
              {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" />}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-[13px] text-gray-500 text-center py-10">加载中...</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-gray-500 text-center py-10">回收站为空</p>
        ) : (
          <div className="rounded-2xl overflow-hidden border border-black/5">
            <table className="w-full">
              <thead>
                <tr className="glass-page-card">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">名称</th>
                  {tab !== 'ip' && <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">所属 IP</th>}
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">删除时间</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {items.map(item => (
                  <tr key={`${tab}-${item.id}`} className="hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-3 text-[13px] font-medium text-gray-700">{getTitle(item)}</td>
                    {tab !== 'ip' && <td className="px-4 py-3 text-[13px] text-gray-500">{item.ip_name || '-'}</td>}
                    <td className="px-4 py-3 text-[12px] text-gray-500">{item.deleted_at}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setRestoreTarget(item)} className="px-2 py-1 text-[12px] text-emerald-600 hover:bg-emerald-500/10 rounded-lg">恢复</button>
                      <button onClick={() => openDeleteDialog(item)} className="px-2 py-1 text-[12px] text-red-400 hover:bg-red-500/10 rounded-lg">彻底删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)} onConfirm={handleRestore}
        title="恢复" message={`确定要恢复「${restoreTarget ? getTitle(restoreTarget) : ''}」吗？`} confirmLabel="恢复" />
      <ConfirmDialog open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setImpact(null); setFileCount(0); }} onConfirm={handlePermanentDelete}
        title="彻底删除" message={describeImpact()} confirmLabel="彻底删除" />
    </div>
  );
}
