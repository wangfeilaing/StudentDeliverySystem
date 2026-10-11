'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import VideoUpload from './VideoUpload';
import VideoPlayer from './VideoPlayer';

interface Video { id: number; title: string; category: string; file_path: string; }
interface Props { ipId: number; videos: Video[]; }

const categoryLabels: Record<string, string> = { highlight: '高光时刻', interview: '采访', collab: '合作', live: '直播', other: '其他' };

export default function VideoGrid({ ipId, videos: initialVideos }: Props) {
  const router = useRouter();
  const [videos, setVideos] = useState(initialVideos);
  const [showUpload, setShowUpload] = useState(false);
  const [playing, setPlaying] = useState<Video | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/videos/${deleteTarget.id}`, { method: 'DELETE' });
    setVideos(prev => prev.filter(v => v.id !== deleteTarget.id));
    router.refresh(); setDeleteTarget(null);
  };
  const handleSuccess = () => { setShowUpload(false); router.refresh(); };

  if (videos.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-[13px] text-gray-500 mb-4">还没有上传视频</p>
        <Button size="sm" onClick={() => setShowUpload(true)}>上传视频</Button>
        <Modal open={showUpload} onClose={() => setShowUpload(false)} title="上传视频">
          <VideoUpload ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowUpload(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setShowUpload(true)}>上传视频</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {videos.map(v => (
          <div key={v.id} className="glass-card overflow-hidden group">
            <div className="aspect-video bg-black/5 flex items-center justify-center cursor-pointer relative" onClick={() => setPlaying(v)}>
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-gradient-to-br group-hover:from-emerald-500 group-hover:to-cyan-500 group-hover:scale-110 transition-all">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
              <button onClick={e => { e.stopPropagation(); setDeleteTarget(v); }}
                className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-lg text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between gap-1">
                <div className="flex-1 min-w-0">
                  {v.title && <p className="text-[13px] font-semibold text-gray-700 truncate">{v.title}</p>}
                  {v.category && <span className="inline-block mt-1 px-2 py-0.5 rounded-lg bg-black/5 text-[11px] text-gray-500 font-medium">{categoryLabels[v.category] || v.category}</span>}
                </div>
                <a
                  href={`/api/uploads/${v.file_path}`}
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
          </div>
        ))}
      </div>

      {playing && <VideoPlayer video={playing} onClose={() => setPlaying(null)} />}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="上传视频">
        <VideoUpload ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowUpload(false)} />
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="删除视频" message="确定要删除这个视频吗？" />
    </div>
  );
}
