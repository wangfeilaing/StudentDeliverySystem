'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  src: string;
  title: string;
  onClose: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function VideoPlayer({ src, title, onClose }: Props) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekingRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  seekingRef.current = seeking;

  const handleTimeUpdate = () => {
    if (!seekingRef.current && videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v && isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration);
    }
  };

  const handleEnded = () => setPlaying(false);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.key === ' ') { e.preventDefault(); playing ? v.pause() : v.play(); setPlaying(!playing); }
      if (e.key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 5); }
      if (e.key === 'ArrowRight') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, onClose]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { v.play(); setPlaying(true); }
  };

  const skip = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s));
  };

  const handleSeekStart = () => setSeeking(true);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(parseFloat(e.target.value));
  };

  const handleSeekEnd = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seekValue;
    setCurrentTime(seekValue);
    setSeeking(false);
  };

  const progress = duration > 0 ? (seeking ? seekValue : currentTime) / duration : 0;

  const player = (
    <div
      className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col max-w-[85vw] max-h-[85vh]">
        <video
          ref={videoRef}
          src={src}
          className="max-w-full max-h-[70vh] rounded-xl shadow-2xl cursor-pointer"
          onClick={togglePlay}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          playsInline
        />

        <div className="w-full mt-3 sm:mt-4 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-white/10 backdrop-blur border border-white/10">
          {/* Progress bar */}
          <div className="relative w-full h-5 flex items-center cursor-pointer group mb-1.5 sm:mb-2"
            onMouseDown={handleSeekStart}
            onMouseUp={handleSeekEnd}
            onMouseLeave={() => seeking && handleSeekEnd()}
          >
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={seeking ? seekValue : currentTime}
              onChange={handleSeekChange}
              onMouseDown={handleSeekStart}
              onMouseUp={handleSeekEnd}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow group-hover:scale-125 transition-transform"
              style={{ left: `calc(${progress * 100}% - 6px)` }}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button onClick={() => skip(-5)} className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all" title="后退 5 秒">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                </svg>
              </button>

              <button onClick={togglePlay} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all" title={playing ? '暂停' : '播放'}>
                {playing ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button onClick={() => skip(5)} className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all" title="快进 5 秒">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                </svg>
              </button>
            </div>

            <span className="text-[11px] sm:text-[12px] text-white/60 tabular-nums whitespace-nowrap">
              {formatTime(seeking ? seekValue : currentTime)} / {formatTime(duration)}
            </span>

            <span className="hidden sm:inline text-[11px] sm:text-[12px] text-white/40 truncate max-w-[120px] sm:max-w-[200px] ml-auto">{title}</span>

            <button onClick={onClose} className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all ml-auto sm:ml-0" title="关闭">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 sm:bottom-16 left-1/2 -translate-x-1/2 text-white/20 text-[10px] sm:text-[11px] hidden sm:block whitespace-nowrap">
        点击视频播放/暂停 · ← → 快进快退 · 空格键播放/暂停 · ESC 关闭
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(player, document.body);
}
