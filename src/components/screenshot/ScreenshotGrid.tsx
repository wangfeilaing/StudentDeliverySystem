'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ScreenshotUpload from './ScreenshotUpload';
import ScreenshotLightbox from './ScreenshotLightbox';

interface Screenshot { id: number; title: string; category: string; file_path: string; }
interface Props { ipId: number; screenshots: Screenshot[]; }

const categoryLabels: Record<string, string> = { positive: '好评', negative: '差评', neutral: '中性' };

export default function ScreenshotGrid({ ipId, screenshots: initialScreenshots }: Props) {
  const router = useRouter();
  const [screenshots, setScreenshots] = useState(initialScreenshots);
  const [showUpload, setShowUpload] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Screenshot | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/screenshots/${deleteTarget.id}`, { method: 'DELETE' });
    setScreenshots(prev => prev.filter(s => s.id !== deleteTarget.id));
    router.refresh(); setDeleteTarget(null);
  };
  const handleSuccess = () => { setShowUpload(false); router.refresh(); };

  if (screenshots.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-[13px] text-gray-500 mb-4">还没有上传截图</p>
        <Button size="sm" onClick={() => setShowUpload(true)}>上传截图</Button>
        <Modal open={showUpload} onClose={() => setShowUpload(false)} title="上传截图">
          <ScreenshotUpload ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowUpload(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setShowUpload(true)}>上传截图</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {screenshots.map((s, i) => (
          <div key={s.id} className="group">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-black/5 border border-black/5 cursor-pointer" onClick={() => setLightboxIndex(i)}>
              <img src={`/api/uploads/${s.file_path}`} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
              <button onClick={e => { e.stopPropagation(); setDeleteTarget(s); }}
                className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-lg text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <div className="flex-1 min-w-0">
                {s.title && <p className="text-[12px] text-gray-700 font-medium truncate">{s.title}</p>}
                {s.category && <span className="text-[11px] text-gray-500">{categoryLabels[s.category] || s.category}</span>}
              </div>
              <a
                href={`/api/uploads/${s.file_path}`}
                download
                onClick={e => e.stopPropagation()}
                className="w-5 h-5 rounded-md bg-black/5 hover:bg-emerald-500/20 flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                title="下载"
              >
                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            </div>
          </div>
        ))}
      </div>

      {lightboxIndex !== null && <ScreenshotLightbox screenshots={screenshots} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onPrev={() => setLightboxIndex(Math.max(0, lightboxIndex - 1))} onNext={() => setLightboxIndex(Math.min(screenshots.length - 1, lightboxIndex + 1))} />}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="上传截图">
        <ScreenshotUpload ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowUpload(false)} />
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="删除截图" message="确定要删除这张截图吗？" />
    </div>
  );
}
