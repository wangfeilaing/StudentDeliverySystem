'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  file: File;
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
}

const FRAME = 340;

export default function ImageCropper({ file, onCrop, onCancel }: Props) {
  const [imgSrc, setImgSrc] = useState('');
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  // Use refs to avoid stale closure issues during drag
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Keep refs in sync
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { posRef.current = pos; }, [pos]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const nw = e.currentTarget.naturalWidth;
    const nh = e.currentTarget.naturalHeight;
    setImgSize({ w: nw, h: nh });
    // Fit so the shorter side fills the frame
    const s = FRAME / Math.min(nw, nh);
    setScale(s);
    scaleRef.current = s;
    const p = { x: (FRAME - nw * s) / 2, y: (FRAME - nh * s) / 2 };
    setPos(p);
    posRef.current = p;
  };

  // Clamp: keep at least one image edge touching each frame edge
  const clampPos = (s: number, x: number, y: number) => {
    const iw = imgSize.w * s;
    const ih = imgSize.h * s;
    const mx = iw > FRAME ? FRAME - iw : 0;
    const Mx = iw > FRAME ? 0 : FRAME - iw;
    const my = ih > FRAME ? FRAME - ih : 0;
    const My = ih > FRAME ? 0 : FRAME - ih;
    return {
      x: Math.max(mx, Math.min(Mx, x)),
      y: Math.max(my, Math.min(My, y)),
    };
  };

  // Center-based zoom — always uses latest ref values
  const applyZoom = useCallback((factor: number) => {
    const prev = scaleRef.current;
    const ns = Math.max(0.25, Math.min(5, prev * factor));
    const ratio = ns / prev;
    const cx = FRAME / 2;
    const cy = FRAME / 2;
    const pp = posRef.current;
    const np = clampPos(ns, cx - (cx - pp.x) * ratio, cy - (cy - pp.y) * ratio);
    scaleRef.current = ns;
    posRef.current = np;
    setScale(ns);
    setPos(np);
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    applyZoom(e.deltaY > 0 ? 0.9 : 1.1);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, px: posRef.current.x, py: posRef.current.y };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const np = clampPos(scaleRef.current, dragStart.current.px + dx, dragStart.current.py + dy);
      posRef.current = np;
      setPos(np);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const onSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ns = parseFloat(e.target.value);
    const prev = scaleRef.current;
    const ratio = ns / prev;
    const cx = FRAME / 2;
    const cy = FRAME / 2;
    const pp = posRef.current;
    const np = clampPos(ns, cx - (cx - pp.x) * ratio, cy - (cy - pp.y) * ratio);
    scaleRef.current = ns;
    posRef.current = np;
    setScale(ns);
    setPos(np);
  };

  const doCrop = () => {
    const s = scaleRef.current;
    const ratio = 1 / s;
    const sx = -posRef.current.x * ratio;
    const sy = -posRef.current.y * ratio;
    const sl = FRAME * ratio;

    const cSx = Math.max(0, sx);
    const cSy = Math.max(0, sy);
    const cSl = Math.min(imgSize.w - cSx, imgSize.h - cSy, sl - (cSx - sx), sl - (cSy - sy));

    const OUT = 512;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imgSrc;
    const draw = () => {
      ctx.drawImage(img, cSx, cSy, cSl, cSl, 0, 0, OUT, OUT);
      canvas.toBlob(blob => {
        if (blob) {
          const ext = file.name.split('.').pop() || 'jpg';
          onCrop(new File([blob], `avatar_${Date.now()}.${ext}`, { type: 'image/jpeg' }));
        }
      }, 'image/jpeg', 0.92);
    };
    if (img.complete) draw();
    else img.onload = draw;
  };

  const pct = Math.round(scale * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-md shadow-2xl select-none"
        style={{ background: 'rgba(15,23,42,0.9)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-bold text-white mb-1">裁剪头像</h3>
        <p className="text-[12px] text-gray-500 mb-4">拖拽移动 · 滚轮缩放 · 框内为 1:1 裁剪区域</p>

        {/* Crop area */}
        <div className="flex justify-center mb-4">
          <div
            className="relative overflow-hidden rounded-2xl bg-slate-900"
            style={{ width: FRAME, height: FRAME, cursor: dragging ? 'grabbing' : 'grab' }}
            onMouseDown={onMouseDown}
            onWheel={onWheel}
          >
            {/* Hidden preload image to get natural dimensions */}
            {imgSrc && imgSize.w === 0 && (
              <img
                src={imgSrc}
                onLoad={onImgLoad}
                alt=""
                className="hidden"
              />
            )}

            {/* Image — sized to natural dimensions, then CSS transform to scale uniformly */}
            {imgSize.w > 0 && (
              <div
                className="absolute"
                style={{
                  width: imgSize.w,
                  height: imgSize.h,
                  transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                  transformOrigin: 'left top',
                }}
              >
                <img
                  src={imgSrc}
                  alt=""
                  draggable={false}
                  className="block pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Grid overlay */}
            <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 3 3" preserveAspectRatio="none">
              <line x1="1" y1="0" x2="1" y2="3" stroke="white" strokeWidth="0.02" opacity="0.25" />
              <line x1="2" y1="0" x2="2" y2="3" stroke="white" strokeWidth="0.02" opacity="0.25" />
              <line x1="0" y1="1" x2="3" y2="1" stroke="white" strokeWidth="0.02" opacity="0.25" />
              <line x1="0" y1="2" x2="3" y2="2" stroke="white" strokeWidth="0.02" opacity="0.25" />
            </svg>

            {/* Frame border */}
            <div className="absolute inset-0 pointer-events-none border border-white/15 rounded-2xl" />

            {/* Corner marks */}
            <div className="absolute top-2.5 left-2.5 w-6 h-6 border-t-2 border-l-2 border-black/50 rounded-tl pointer-events-none" />
            <div className="absolute top-2.5 right-2.5 w-6 h-6 border-t-2 border-r-2 border-black/50 rounded-tr pointer-events-none" />
            <div className="absolute bottom-2.5 left-2.5 w-6 h-6 border-b-2 border-l-2 border-black/50 rounded-bl pointer-events-none" />
            <div className="absolute bottom-2.5 right-2.5 w-6 h-6 border-b-2 border-r-2 border-black/50 rounded-br pointer-events-none" />
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-3 mb-3 px-1">
          <button
            type="button"
            onClick={() => applyZoom(0.85)}
            disabled={scale <= 0.25}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-20"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <input
            type="range"
            min="0.25"
            max="5"
            step="0.01"
            value={scale}
            onChange={onSlider}
            className="flex-1 h-1.5 rounded-full bg-white/20 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <button
            type="button"
            onClick={() => applyZoom(1.18)}
            disabled={scale >= 5}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-20"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
          <span className="text-[11px] text-gray-500 w-10 text-right tabular-nums">{pct}%</span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-[13px] text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={doCrop}
            className="px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.97]"
          >
            确认裁剪
          </button>
        </div>
      </div>
    </div>
  );
}
