'use client';
import { useState, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props { ipId: number; onSuccess: () => void; onCancel: () => void; }

export default function VideoUpload({ ipId, onSuccess, onCancel }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setError('请选择视频文件'); return; }
    setUploading(true); setError('');
    const formData = new FormData();
    formData.append('file', file); formData.append('title', title); formData.append('category', category);
    try {
      const res = await fetch(`/api/ips/${ipId}/videos`, { method: 'POST', body: formData });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || '上传失败'); }
      router.refresh(); onSuccess();
    } catch (err) { setError((err as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="p-3 bg-red-500/15 border border-red-400/20 rounded-2xl text-[13px] text-red-400">{error}</div>}
      <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-black/5 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-400/50 transition-colors bg-black/5">
        <div className="text-3xl mb-2 opacity-60">🎬</div>
        <p className="text-[13px] text-gray-500">{file ? file.name : '点击选择视频文件'}</p>
        <p className="text-[11px] text-gray-500 mt-1">MP4、WebM、MOV，最大 500MB</p>
        <input ref={fileRef} type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} className="hidden" />
      </div>
      <Input label="标题" value={title} onChange={e => setTitle(e.target.value)} placeholder="高光时刻" />
      <div>
        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">分类</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input-glass w-full">
          <option value="">无分类</option><option value="highlight">高光时刻</option><option value="interview">采访</option><option value="collab">合作</option><option value="live">直播</option><option value="other">其他</option>
        </select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={uploading || !file}>{uploading ? '上传中...' : '上传视频'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}
