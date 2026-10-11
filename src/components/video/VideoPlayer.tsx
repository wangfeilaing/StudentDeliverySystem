'use client';
import { useEffect, useRef } from 'react';

interface Video {
  id: number;
  title: string;
  file_path: string;
}

interface Props {
  video: Video;
  onClose: () => void;
}

export default function VideoPlayer({ video, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <button
        className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-600 z-10"
        onClick={onClose}
      >
        &times;
      </button>
      <div className="max-w-[90vw] max-h-[90vh]">
        <video
          src={`/api/uploads/${video.file_path}`}
          controls
          autoPlay
          className="max-w-full max-h-[85vh] rounded-lg"
        />
        {video.title && <p className="text-white text-center mt-3">{video.title}</p>}
      </div>
    </div>
  );
}
