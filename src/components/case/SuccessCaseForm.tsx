'use client';
import { useState, FormEvent } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';

interface SuccessCaseData {
  id?: number;
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
}

interface Props {
  ipId: number;
  initial?: SuccessCaseData;
  onSuccess: () => void;
  onCancel: () => void;
}

const platforms = ['抖音', '小红书', '快手', 'B站', '视频号', '微博', '其他'];

export default function SuccessCaseForm({ ipId, initial, onSuccess, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title || '');
  const [platform, setPlatform] = useState(initial?.platform || '');
  const [videoUrl, setVideoUrl] = useState(initial?.video_url || '');
  const [publishDate, setPublishDate] = useState(initial?.publish_date || '');
  const [playCount, setPlayCount] = useState(initial?.play_count || 0);
  const [likeCount, setLikeCount] = useState(initial?.like_count || 0);
  const [commentCount, setCommentCount] = useState(initial?.comment_count || 0);
  const [favoriteCount, setFavoriteCount] = useState(initial?.favorite_count || 0);
  const [shareCount, setShareCount] = useState(initial?.share_count || 0);
  const [conversion, setConversion] = useState(initial?.conversion_result || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!initial;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title) { setError('请输入案例标题'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit
        ? `/api/success-cases/${initial!.id}`
        : `/api/ips/${ipId}/success-cases`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, platform, video_url: videoUrl, publish_date: publishDate,
          play_count: playCount, like_count: likeCount, comment_count: commentCount,
          favorite_count: favoriteCount, share_count: shareCount,
          conversion_result: conversion, screenshot_ids: '', notes,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '保存失败'); }
      onSuccess();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const formatNumber = (val: number) => val ? val.toLocaleString() : '';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="p-3 bg-red-500/10 border border-red-400/20 rounded-2xl text-[13px] text-red-400">{error}</div>}
      <Input label="案例标题 *" value={title} onChange={e => setTitle(e.target.value)} placeholder="爆款视频标题" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">平台</label>
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="input-glass w-full">
            <option value="">选择平台</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <Input label="发布时间" type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="播放量" type="number" value={playCount} onChange={e => setPlayCount(parseInt(e.target.value) || 0)} />
        <Input label="点赞量" type="number" value={likeCount} onChange={e => setLikeCount(parseInt(e.target.value) || 0)} />
        <Input label="评论量" type="number" value={commentCount} onChange={e => setCommentCount(parseInt(e.target.value) || 0)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="收藏量" type="number" value={favoriteCount} onChange={e => setFavoriteCount(parseInt(e.target.value) || 0)} />
        <Input label="转发量" type="number" value={shareCount} onChange={e => setShareCount(parseInt(e.target.value) || 0)} />
        <Input label="视频链接" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="可选" />
      </div>
      <Input label="转化效果" value={conversion} onChange={e => setConversion(e.target.value)} placeholder="如：带动GMV 50w" />
      <Textarea label="备注" value={notes} onChange={e => setNotes(e.target.value)} placeholder="其他说明..." rows={2} />
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? '保存中...' : isEdit ? '保存修改' : '添加案例'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}
