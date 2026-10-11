'use client';
import { useEffect } from 'react';

interface Props {
  open: boolean; onClose: () => void;
  title?: string; children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const sizeMap: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw] max-h-[95vh]',
};

export default function Modal({ open, onClose, title, children, size = 'md', className = '' }: Props) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className={`relative glass rounded-2xl ${sizeMap[size]} w-full mx-4 max-h-[85vh] overflow-auto shadow-2xl animate-in-scale ${className}`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
            <h3 className="text-[16px] font-semibold text-gray-800">{title}</h3>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 hover:bg-black/5 transition-all duration-300 hover:rotate-90"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
