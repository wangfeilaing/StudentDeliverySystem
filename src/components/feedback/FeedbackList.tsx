'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FeedbackForm from './FeedbackForm';

interface Feedback {
  id: number;
  ip_id: number;
  source: string;
  rating: number;
  content: string;
  reviewer_name: string;
  related_project: string;
  screenshot_ids: string;
  created_at: string;
}

interface Props {
  ipId: number;
  feedbacks: Feedback[];
}

const sourceColors: Record<string, string> = {
  '小红书': 'bg-red-500/15 text-red-400 border border-red-400/20',
  '抖音': 'bg-black/5 text-gray-700',
  '快手': 'bg-orange-500/15 text-orange-400 border border-orange-400/20',
  'B站': 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/20',
  '微博': 'bg-red-500/15 text-red-400 border border-red-400/20',
  '微信': 'bg-green-500/15 text-green-400 border border-green-400/20',
};

export default function FeedbackList({ ipId, feedbacks: initialFeedbacks }: Props) {
  const [feedbacks, setFeedbacks] = useState(initialFeedbacks);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Feedback | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Feedback | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/feedbacks/${deleteTarget.id}`, { method: 'DELETE' });
    setFeedbacks(prev => prev.filter(f => f.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleSuccess = () => { setShowForm(false); setEditItem(null); };

  if (feedbacks.length === 0 && !showForm) {
    return (
      <div className="text-center py-10">
        <p className="text-[13px] text-gray-500 mb-4">暂无好评反馈</p>
        <Button size="sm" onClick={() => setShowForm(true)}>添加反馈</Button>
        <Modal open={showForm} onClose={() => setShowForm(false)} title="添加好评反馈">
          <FeedbackForm ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setShowForm(true)}>添加反馈</Button>
      </div>
      <div className="space-y-3">
        {feedbacks.map(f => (
          <div key={f.id} className="glass-card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {f.source && <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-medium ${sourceColors[f.source] || 'bg-black/5 text-gray-500'}`}>{f.source}</span>}
                  {f.rating > 0 && (
                    <span className="text-[13px] text-yellow-500">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                  )}
                </div>
                {f.content && <p className="text-[13px] text-gray-600 mt-1">{f.content}</p>}
                {f.reviewer_name && <span className="text-[12px] text-gray-500 mt-1 block">反馈人：{f.reviewer_name}</span>}
                {f.related_project && <span className="text-[12px] text-gray-500">项目：{f.related_project}</span>}
                <span className="text-[11px] text-gray-600 block mt-1">{f.created_at}</span>
              </div>
              <div className="flex gap-1 ml-3">
                <button onClick={() => setEditItem(f)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-600 rounded-lg hover:bg-black/5">编辑</button>
                <button onClick={() => setDeleteTarget(f)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="添加好评反馈">
        <FeedbackForm ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />
      </Modal>
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="编辑好评反馈">
        {editItem && <FeedbackForm ipId={ipId} initial={editItem} onSuccess={handleSuccess} onCancel={() => setEditItem(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="删除反馈" message="确定要删除这条反馈吗？" />
    </div>
  );
}
