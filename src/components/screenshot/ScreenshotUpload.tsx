'use client';
import { useState, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props { ipId: number; onSuccess: () => void; onCancel: () => void; }

export default function ScreenshotUpload({ ipId, onSuccess, onCancel }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) { setError('请选择文件'); return; }
    setUploading(true); setError('');
    const formData = new FormData();
    formData.append('file', file); formData.append('title', title); formData.append('category', category);
    try {
      const res = await fetch(`/api/ips/${ipId}/screenshots`, { method: 'POST', body: formData });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || '上传失败'); }
      router.refresh(); onSuccess();
    } catch (err) { setError((err as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="p-3 bg-red-500/15 border border-red-400/20 rounded-2xl text-[13px] text-red-400">{error}</div>}
      <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-black/5 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-400/50 transition-colors bg-black/5">
        {preview ? <img src={preview} alt="预览" className="max-h-48 mx-auto rounded-xl" /> : (
          <div>
            <div className="text-3xl mb-2 opacity-60">🖼️</div>
            <p className="text-[13px] text-gray-500">点击选择截图文件</p>
            <p className="text-[11px] text-gray-500 mt-1">JPG、PNG、WebP，最大 20MB</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      </div>
      <Input label="标题" value={title} onChange={e => setTitle(e.target.value)} placeholder="如：用户好评截图" />
      <div>
        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">分类</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input-glass w-full">
          <option value="">无分类</option><option value="positive">好评</option><option value="negative">差评</option><option value="neutral">中性</option>
        </select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={uploading || !file}>{uploading ? '上传中...' : '上传截图'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}
