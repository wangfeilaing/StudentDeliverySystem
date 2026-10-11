'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import SuccessCaseForm from './SuccessCaseForm';

interface SuccessCase {
  id: number;
  title: string;
  platform: string;
  video_url: string;
  publish_date: string;
  play_count: number;
  like_count: number;
  comment_count: number;
  favorite_count: number;
  share_count: number;
  conversion_result: string;
  notes: string;
  created_at: string;
}

interface Props {
  ipId: number;
  cases: SuccessCase[];
}

const platformColors: Record<string, string> = {
  '抖音': 'bg-black/5 text-gray-700',
  '小红书': 'bg-red-500/15 text-red-400 border border-red-400/20',
  '快手': 'bg-orange-500/15 text-orange-400 border border-orange-400/20',
  'B站': 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/20',
  '视频号': 'bg-green-500/15 text-green-400 border border-green-400/20',
};

export default function SuccessCaseList({ ipId, cases: initialCases }: Props) {
  const [cases, setCases] = useState(initialCases);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<SuccessCase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SuccessCase | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/success-cases/${deleteTarget.id}`, { method: 'DELETE' });
    setCases(prev => prev.filter(c => c.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleSuccess = () => { setShowForm(false); setEditItem(null); };

  if (cases.length === 0 && !showForm) {
    return (
      <div className="text-center py-10">
        <p className="text-[13px] text-gray-500 mb-4">暂无爆款案例</p>
        <Button size="sm" onClick={() => setShowForm(true)}>添加案例</Button>
        <Modal open={showForm} onClose={() => setShowForm(false)} title="添加爆款案例">
          <SuccessCaseForm ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setShowForm(true)}>添加案例</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cases.map(c => (
          <div key={c.id} className="glass-card p-4">
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-[14px] font-semibold text-gray-800">{c.title}</h4>
              {c.platform && <span className={`px-2 py-0.5 rounded-lg text-[11px] font-medium ${platformColors[c.platform] || 'bg-black/5 text-gray-500'}`}>{c.platform}</span>}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-[15px] font-bold text-gray-700">{(c.play_count || 0).toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">播放量</div>
              </div>
              <div className="text-center">
                <div className="text-[15px] font-bold text-gray-700">{(c.like_count || 0).toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">点赞</div>
              </div>
              <div className="text-center">
                <div className="text-[15px] font-bold text-gray-700">{(c.comment_count || 0).toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">评论</div>
              </div>
            </div>
            {c.conversion_result && <p className="text-[12px] text-emerald-600 mb-2">{c.conversion_result}</p>}
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-gray-600">{c.created_at}</span>
              <div className="flex gap-1">
                <button onClick={() => setEditItem(c)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-600 rounded-lg hover:bg-black/5">编辑</button>
                <button onClick={() => setDeleteTarget(c)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="添加爆款案例">
        <SuccessCaseForm ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="编辑爆款案例">
        {editItem && <SuccessCaseForm ipId={ipId} initial={editItem} onSuccess={handleSuccess} onCancel={() => setEditItem(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="删除案例" message="确定要删除这个爆款案例吗？" />
    </div>
  );
}
