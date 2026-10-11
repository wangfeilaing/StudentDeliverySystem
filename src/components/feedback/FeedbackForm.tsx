'use client';
import { useState, FormEvent } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';

interface FeedbackData {
  source: string;
  rating: number;
  content: string;
  screenshot_ids: string;
  reviewer_name: string;
  related_project: string;
}

interface Props {
  ipId: number;
  initial?: FeedbackData;
  onSuccess: () => void;
  onCancel: () => void;
}

const sources = ['小红书', '抖音', '快手', 'B站', '微博', '微信', '其他'];
const ratingLabels = ['', '很差', '较差', '一般', '较好', '非常好'];

export default function FeedbackForm({ ipId, initial, onSuccess, onCancel }: Props) {
  const [source, setSource] = useState(initial?.source || '');
  const [rating, setRating] = useState(initial?.rating || 0);
  const [content, setContent] = useState(initial?.content || '');
  const [reviewerName, setReviewerName] = useState(initial?.reviewer_name || '');
  const [relatedProject, setRelatedProject] = useState(initial?.related_project || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!initial;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!source) { setError('请选择来源平台'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit
        ? `/api/feedbacks/${(initial as any).id}`
        : `/api/ips/${ipId}/feedbacks`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, rating, content, screenshot_ids: '', reviewer_name: reviewerName, related_project: relatedProject }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '保存失败'); }
      onSuccess();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="p-3 bg-red-500/10 border border-red-400/20 rounded-2xl text-[13px] text-red-400">{error}</div>}
      <div>
        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">来源平台</label>
        <select value={source} onChange={e => setSource(e.target.value)} className="input-glass w-full">
          <option value="">选择来源平台</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">评级</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button key={star} type="button" onClick={() => setRating(star)}
              className={`w-8 h-8 rounded-lg text-lg transition-colors ${star <= rating ? 'text-yellow-500 bg-yellow-500/15' : 'text-gray-600 bg-black/5 hover:text-yellow-400'}`}>
              ★
            </button>
          ))}
          <span className="ml-2 text-[13px] text-gray-500 self-center">{rating ? ratingLabels[rating] : '未评级'}</span>
        </div>
      </div>
      <Textarea label="反馈内容" value={content} onChange={e => setContent(e.target.value)} placeholder="描述客户反馈的具体内容..." rows={3} />
      <Input label="反馈人" value={reviewerName} onChange={e => setReviewerName(e.target.value)} placeholder="客户昵称或姓名" />
      <Input label="关联项目" value={relatedProject} onChange={e => setRelatedProject(e.target.value)} placeholder="关联的合作项目名称" />
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? '保存中...' : isEdit ? '保存修改' : '添加反馈'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}
