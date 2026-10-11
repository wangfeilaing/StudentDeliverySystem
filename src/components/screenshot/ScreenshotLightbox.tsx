'use client';
import { useEffect, useCallback } from 'react';

interface Screenshot {
  id: number;
  title: string;
  category: string;
  file_path: string;
}

interface Props {
  screenshots: Screenshot[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function ScreenshotLightbox({ screenshots, index, onClose, onPrev, onNext }: Props) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft') onPrev();
    if (e.key === 'ArrowRight') onNext();
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  const current = screenshots[index];
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-600 z-10" onClick={onClose}>
        &times;
      </button>
      {index > 0 && (
        <button className="absolute left-4 text-white text-4xl hover:text-gray-600 z-10" onClick={(e) => { e.stopPropagation(); onPrev(); }}>
          ‹
        </button>
      )}
      {index < screenshots.length - 1 && (
        <button className="absolute right-4 text-white text-4xl hover:text-gray-600 z-10" onClick={(e) => { e.stopPropagation(); onNext(); }}>
          ›
        </button>
      )}
      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={`/api/uploads/${current.file_path}`}
          alt={current.title}
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
        />
        {current.title && (
          <p className="text-white text-center mt-3">{current.title}</p>
        )}
        <p className="text-gray-500 text-center text-sm mt-1">{index + 1} / {screenshots.length}</p>
      </div>
    </div>
  );
}
