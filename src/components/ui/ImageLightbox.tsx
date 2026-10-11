'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  src: string;
  title: string;
  onClose: () => void;
}

type Tool = 'view' | 'crop' | 'blur' | 'text';
type DragMode = 'none' | 'draw' | 'move-crop' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'move-text' | 'resize-text';

interface CropFrame {
  x: number; y: number; w: number; h: number;
}

interface TextAnnotation {
  id: string;
  x: number; y: number;
  text: string;
  color: string;
  strokeColor: string;
  fontSize: number;
}

interface BlurRect {
  x: number; y: number; w: number; h: number;
}

const TEXT_COLORS = [
  '#ef4444', // red
  '#ffffff', // white
  '#fbbf24', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#000000', // black
];

const HANDLE_R = 8; // handle hit radius in image pixels

export default function ImageLightbox({ src, title, onClose }: Props) {
  const [tool, setTool] = useState<Tool>('view');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);

  // Drawing / dragging
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [dragFrameSnap, setDragFrameSnap] = useState<CropFrame | null>(null);

  // Crop frame (persists until applied or cancelled)
  const [cropFrame, setCropFrame] = useState<CropFrame | null>(null);

  // Blur rectangles
  const [blurs, setBlurs] = useState<BlurRect[]>([]);

  // Text
  const [texts, setTexts] = useState<TextAnnotation[]>([]);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [strokeEnabled, setStrokeEnabled] = useState(true);
  const [strokeColor, setStrokeColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(80);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasMovedRef = useRef(false);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  // ---- Image loading ----
  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    image.onload = () => {
      setImg(image);
      const maxW = window.innerWidth * 0.85;
      const maxH = window.innerHeight * 0.75;
      setScale(Math.min(maxW / image.width, maxH / image.height, 1));
    };
  }, [src]);

  // ---- Coordinate helpers ----
  const toImgCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (img.width / rect.width),
      y: (e.clientY - rect.top) * (img.height / rect.height),
    };
  }, [img]);

  const isNear = (px: number, py: number, tx: number, ty: number) => {
    return Math.abs(px - tx) < HANDLE_R && Math.abs(py - ty) < HANDLE_R;
  };

  const detectHandle = (cx: number, cy: number, cf: CropFrame): DragMode => {
    if (isNear(cx, cy, cf.x, cf.y)) return 'resize-tl';
    if (isNear(cx, cy, cf.x + cf.w, cf.y)) return 'resize-tr';
    if (isNear(cx, cy, cf.x, cf.y + cf.h)) return 'resize-bl';
    if (isNear(cx, cy, cf.x + cf.w, cf.y + cf.h)) return 'resize-br';
    if (cx > cf.x && cx < cf.x + cf.w && cy > cf.y && cy < cf.y + cf.h) return 'move-crop';
    return 'none';
  };

  const detectText = (cx: number, cy: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    for (const t of texts) {
      const fSize = t.fontSize || 24;
      ctx.font = `bold ${fSize}px system-ui, sans-serif`;
      const m = ctx.measureText(t.text);
      const textH = fSize * 1.2;
      // Text baseline is at (t.x, t.y), text extends upward
      const left = t.x - 6;
      const right = t.x + m.width + 6;
      const top = t.y - textH - 6;
      const bottom = t.y + 6;
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
        return t.id;
      }
    }
    return null;
  };

  // ---- Canvas rendering ----
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;

    // Base image
    ctx.drawImage(img, 0, 0);

    // Blur regions
    for (const b of blurs) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.filter = 'blur(12px)';
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Text annotations
    for (const t of texts) {
      const fSize = t.fontSize || 24;
      ctx.font = `bold ${fSize}px system-ui, sans-serif`;
      if (t.strokeColor) {
        ctx.lineWidth = Math.max(2, fSize / 8);
        ctx.strokeStyle = t.strokeColor;
        ctx.strokeText(t.text, t.x, t.y);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);

      // Selected highlight + resize handle + delete button
      if (t.id === selectedTextId && dragMode !== 'resize-text') {
        const m = ctx.measureText(t.text);
        const textH = fSize * 1.2;
        const rx = t.x - 3, ry = t.y - textH + 2, rw = m.width + 6, rh = textH + 4;
        // Dashed selection box
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        // Resize handle at bottom-right
        const hs = 10;
        ctx.fillStyle = '#10b981';
        ctx.fillRect(rx + rw - hs, ry + rh - hs, hs, hs);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + rw - hs, ry + rh - hs, hs, hs);
        // Delete button at top-right
        const dx = rx + rw - hs;
        const dy = ry;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(dx, dy, hs, hs);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx, dy, hs, hs);
        // × inside delete button
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(dx + 2.5, dy + 2.5);
        ctx.lineTo(dx + hs - 2.5, dy + hs - 2.5);
        ctx.moveTo(dx + hs - 2.5, dy + 2.5);
        ctx.lineTo(dx + 2.5, dy + hs - 2.5);
        ctx.stroke();
      }
    }

    // Crop frame overlay
    const cf = dragMode === 'draw' ? getDrawRect() : cropFrame;
    if (cf && (tool === 'crop' || dragMode !== 'none')) {
      // Dark overlay outside crop area
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, canvas.width, cf.y);
      ctx.fillRect(0, cf.y, cf.x, cf.h);
      ctx.fillRect(cf.x + cf.w, cf.y, canvas.width - cf.x - cf.w, cf.h);
      ctx.fillRect(0, cf.y + cf.h, canvas.width, canvas.height - cf.y - cf.h);

      // Frame border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(cf.x, cf.y, cf.w, cf.h);
      ctx.setLineDash([]);

      // Corner handles
      const handleSz = HANDLE_R * 2;
      [
        [cf.x, cf.y],
        [cf.x + cf.w, cf.y],
        [cf.x, cf.y + cf.h],
        [cf.x + cf.w, cf.y + cf.h],
      ].forEach(([hx, hy]) => {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, HANDLE_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // Size label
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${cf.w}×${cf.h}`, cf.x + 4, cf.y - 8);
    }

    // Blur draw preview
    if (dragMode === 'draw' && tool === 'blur') {
      const r = getDrawRect();
      if (r.w > 2 && r.h > 2) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(16,185,129,0.15)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
  }, [img, blurs, texts, selectedTextId, cropFrame, dragMode, tool, dragStart, dragCurrent]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const getDrawRect = (): CropFrame => {
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x);
    const h = Math.abs(dragCurrent.y - dragStart.y);
    return { x, y, w, h };
  };

  // ---- Mouse handlers ----
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = toImgCoords(e);

    if (tool === 'text') {
      // Check if clicking the resize handle of selected text
      if (selectedTextId) {
        const st = texts.find(tx => tx.id === selectedTextId);
        if (st) {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const fSize = st.fontSize || 24;
              ctx.font = `bold ${fSize}px system-ui, sans-serif`;
              const m = ctx.measureText(st.text);
              const textH = fSize * 1.2;
              const rx = st.x - 3, ry = st.y - textH + 2;
              const rw = m.width + 6, rh = textH + 4;
              const hs = 12;
              if (pos.x >= rx + rw - hs && pos.x <= rx + rw &&
                  pos.y >= ry + rh - hs && pos.y <= ry + rh) {
                setDragMode('resize-text');
                setDragStart(pos);
                setDragFrameSnap({ x: st.x, y: st.y, w: fSize, h: 0 });
                return;
              }
            }
          }
        }
      }
      // Check if clicking existing text
      const hitId = detectText(pos.x, pos.y);
      if (hitId) {
        if (hitId === selectedTextId) {
          // Check if clicking the delete button (top-right red square)
          const st = texts.find(tx => tx.id === hitId);
          if (st && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
              const fSize = st.fontSize || 80;
              ctx.font = `bold ${fSize}px system-ui, sans-serif`;
              const m = ctx.measureText(st.text);
              const textH = fSize * 1.2;
              const rx = st.x - 3, ry = st.y - textH + 2, rw = m.width + 6;
              const hs = 10;
              const dx = rx + rw - hs, dy = ry;
              if (pos.x >= dx - 4 && pos.x <= dx + hs + 4 && pos.y >= dy - 4 && pos.y <= dy + hs + 4) {
                deleteSelectedText();
                return;
              }
            }
          }
          // Check for double-click → edit
          const now = Date.now();
          if (lastClickRef.current.id === hitId && now - lastClickRef.current.time < 350) {
            lastClickRef.current = { id: '', time: 0 };
            const t = texts.find(tx => tx.id === hitId);
            if (t) {
              setEditingTextId(hitId);
              setTextInput(t.text);
              setTextPos({ x: t.x, y: t.y });
              setTextColor(t.color);
              setStrokeColor(t.strokeColor || '#ffffff');
              setStrokeEnabled(!!t.strokeColor);
              setFontSize(t.fontSize || 80);
            }
            return;
          }
          lastClickRef.current = { id: hitId, time: now };
          // Single click on selected text — start drag
          hasMovedRef.current = false;
          setDragMode('move-text');
          setDragStart(pos);
          return;
        }
        // Not selected yet — just select it, don't drag
        lastClickRef.current = { id: hitId, time: Date.now() };
        setSelectedTextId(hitId);
        const t = texts.find(tx => tx.id === hitId);
        if (t) {
          setTextColor(t.color);
          setStrokeColor(t.strokeColor || '#ffffff');
          setStrokeEnabled(!!t.strokeColor);
          setFontSize(t.fontSize || 80);
        }
        return;
      }
      // New text
      lastClickRef.current = { id: '', time: 0 };
      setSelectedTextId(null);
      setTextPos(pos);
      setTextInput('');
      setEditingTextId(null);
      return;
    }

    if (tool === 'crop') {
      if (cropFrame) {
        const handle = detectHandle(pos.x, pos.y, cropFrame);
        if (handle !== 'none') {
          setDragMode(handle);
          setDragStart(pos);
          setDragFrameSnap({ ...cropFrame });
          return;
        }
      }
      // Start drawing new crop frame
      setCropFrame(null);
      setDragMode('draw');
      setDragStart(pos);
      setDragCurrent(pos);
      return;
    }

    if (tool === 'blur') {
      setDragMode('draw');
      setDragStart(pos);
      setDragCurrent(pos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = toImgCoords(e);
    setDragCurrent(pos);

    if (dragMode === 'move-text' && selectedTextId) {
      hasMovedRef.current = true;
      setTexts(prev => prev.map(t =>
        t.id === selectedTextId
          ? { ...t, x: t.x + pos.x - dragStart.x, y: t.y + pos.y - dragStart.y }
          : t
      ));
      setDragStart(pos);
      return;
    }

    if (dragMode === 'resize-text' && selectedTextId && dragFrameSnap) {
      // Distance from text anchor = desired font size
      const dy = pos.y - dragFrameSnap.y;
      const newSize = Math.round(Math.max(10, Math.min(120, Math.abs(dy))));
      setFontSize(newSize);
      setTexts(prev => prev.map(t =>
        t.id === selectedTextId ? { ...t, fontSize: newSize } : t
      ));
      return;
    }

    if (dragMode === 'move-crop' && dragFrameSnap) {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      const maxX = img!.width - dragFrameSnap.w;
      const maxY = img!.height - dragFrameSnap.h;
      setCropFrame({
        x: Math.max(0, Math.min(maxX, dragFrameSnap.x + dx)),
        y: Math.max(0, Math.min(maxY, dragFrameSnap.y + dy)),
        w: dragFrameSnap.w,
        h: dragFrameSnap.h,
      });
      return;
    }

    if (dragMode.startsWith('resize-') && dragFrameSnap) {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      let { x, y, w, h } = dragFrameSnap;
      if (dragMode === 'resize-tl') { x += dx; y += dy; w -= dx; h -= dy; }
      if (dragMode === 'resize-tr') { y += dy; w += dx; h -= dy; }
      if (dragMode === 'resize-bl') { x += dx; w -= dx; h += dy; }
      if (dragMode === 'resize-br') { w += dx; h += dy; }
      // Min size
      if (w < 20) w = 20;
      if (h < 20) h = 20;
      // Clamp within image
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x + w > img!.width) w = img!.width - x;
      if (y + h > img!.height) h = img!.height - y;
      setCropFrame({ x, y, w: Math.max(20, w), h: Math.max(20, h) });
      return;
    }
  };

  const handleMouseUp = () => {
    // End text drag
    if (dragMode === 'move-text' && selectedTextId) {
      setDragMode('none');
      return;
    }

    if (dragMode === 'draw') {
      const r = getDrawRect();
      if (r.w < 5 || r.h < 5) { setDragMode('none'); return; }

      if (tool === 'crop') {
        setCropFrame(r);
      } else if (tool === 'blur') {
        setBlurs(prev => [...prev, r]);
        setTool('view');
      }
    }
    setDragMode('none');
    setDragFrameSnap(null);
  };

  // ---- Text actions ----
  const handleTextSubmit = () => {
    if (!textPos || !textInput.trim()) {
      setTextPos(null);
      setTextInput('');
      setEditingTextId(null);
      return;
    }
    let targetId: string;
    if (editingTextId) {
      targetId = editingTextId;
      setTexts(prev => prev.map(t =>
        t.id === editingTextId
          ? { ...t, text: textInput.trim(), color: textColor, strokeColor: strokeEnabled ? strokeColor : '', fontSize }
          : t
      ));
      setEditingTextId(null);
    } else {
      targetId = Math.random().toString(36).slice(2);
      setTexts(prev => [...prev, {
        id: targetId, x: textPos.x, y: textPos.y, text: textInput.trim(),
        color: textColor,
        strokeColor: strokeEnabled ? strokeColor : '',
        fontSize,
      }]);
    }
    setTextPos(null);
    setTextInput('');
    setSelectedTextId(targetId);
  };

  const deleteSelectedText = () => {
    if (selectedTextId) {
      setTexts(prev => prev.filter(t => t.id !== selectedTextId));
      setSelectedTextId(null);
    }
  };

  // When text tool is selected and a text is selected, update its properties
  const handleColorChange = (c: string) => {
    setTextColor(c);
    if (selectedTextId) {
      setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, color: c } : t));
    }
  };

  const handleStrokeColorChange = (c: string) => {
    setStrokeColor(c);
    setStrokeEnabled(true);
    if (selectedTextId) {
      setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, strokeColor: c } : t));
    }
  };

  const toggleStroke = () => {
    if (strokeEnabled) {
      setStrokeEnabled(false);
      if (selectedTextId) {
        setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, strokeColor: '' } : t));
      }
    } else {
      setStrokeEnabled(true);
      if (selectedTextId) {
        setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, strokeColor: strokeColor } : t));
      }
    }
  };

  const changeFontSize = (delta: number) => {
    const newSize = Math.max(10, Math.min(120, fontSize + delta));
    setFontSize(newSize);
    if (selectedTextId) {
      setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, fontSize: newSize } : t));
    }
  };

  // ---- Apply crop ----
  const applyCrop = () => {
    if (!cropFrame || !img) return;
    const { x, y, w, h } = cropFrame;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const octx = offCanvas.getContext('2d')!;

    // Draw cropped portion
    octx.drawImage(img, x, y, w, h, 0, 0, w, h);

    // Reapply blurs within crop area
    for (const b of blurs) {
      const bx = b.x - x, by = b.y - y;
      if (bx + b.w <= 0 || by + b.h <= 0 || bx >= w || by >= h) continue;
      octx.save();
      octx.beginPath();
      octx.rect(bx, by, b.w, b.h);
      octx.clip();
      octx.filter = 'blur(12px)';
      octx.drawImage(offCanvas, 0, 0);
      octx.filter = 'none';
      octx.restore();
    }

    const croppedImg = new Image();
    croppedImg.src = offCanvas.toDataURL();
    croppedImg.onload = () => {
      setImg(croppedImg);
      setBlurs(prev => prev
        .map(b => ({ ...b, x: b.x - x, y: b.y - y }))
        .filter(b => b.x + b.w > 0 && b.y + b.h > 0 && b.x < w && b.y < h));
      setTexts(prev => prev
        .filter(t => t.x >= x && t.x <= x + w && t.y >= y && t.y <= y + h)
        .map(t => ({ ...t, x: t.x - x, y: t.y - y })));
      setCropFrame(null);
      setScale(1);
      setTool('view');
    };
  };

  // ---- Download ----
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = title || 'image.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // ---- Keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTextId && !textPos) {
          deleteSelectedText();
        }
      }
      if (e.key === 'Escape') {
        if (textPos) { setTextPos(null); setEditingTextId(null); }
        else if (cropFrame) setCropFrame(null);
        else if (tool !== 'view') setTool('view');
      }
      if (e.key === 'Enter' && textPos) {
        handleTextSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedTextId, textPos, cropFrame, tool, textInput, textColor, editingTextId]);

  // ---- Tool definitions ----
  const tools: { key: Tool; label: string; icon: string }[] = [
    { key: 'view', label: '浏览', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
    { key: 'crop', label: '裁剪', icon: 'M8 3v2h8V3h2v2h2v2h-2v10h2v2h-2v2h-2v-2H8v2H6v-2H4v-2h2V7H4V5h2V3h2zm2 4v10h8V7h-8z' },
    { key: 'blur', label: '模糊', icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z' },
    { key: 'text', label: '文字', icon: 'M11 4H4v2h3v12h2V6h2V4zM19 6h-5v2h1.5v10h2V8H19V6z' },
  ];

  if (!img) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
        <div className="text-white text-sm">加载中...</div>
      </div>
    );
  }

  const displayW = img.width * scale;
  const displayH = img.height * scale;
  const cursorClass = tool === 'crop'
    ? (dragMode.startsWith('resize-') ? `${dragMode === 'resize-tl' || dragMode === 'resize-br' ? 'cursor-nwse' : 'cursor-nesw'}-resize` : dragMode === 'move-crop' ? 'cursor-move' : 'cursor-crosshair')
    : tool === 'blur' ? 'cursor-crosshair'
    : tool === 'text' ? (textPos ? 'cursor-default' : 'cursor-text')
    : 'cursor-default';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center select-none"
      onClick={e => { if (e.target === e.currentTarget && tool === 'view') onClose(); }}
    >
      {/* ---- Top toolbar ---- */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/10 backdrop-blur border border-white/10 flex-wrap justify-center">
        {tools.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTool(t.key);
              setDragMode('none');
              setDragFrameSnap(null);
              if (t.key !== 'crop') setCropFrame(null);
              if (t.key !== 'text') { setTextPos(null); setEditingTextId(null); }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
              tool === t.key ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
        <div className="w-px h-5 bg-white/20 mx-1" />

        {/* Text properties (visible in text mode or when text is selected) */}
        {(tool === 'text' || selectedTextId) && (
          <>
            <div className="w-px h-5 bg-white/20 mx-0.5" />
            {/* Font size */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => changeFontSize(-2)} className="w-6 h-6 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 text-[14px] font-bold transition-all" title="缩小字号">A⁻</button>
              <span className="text-[10px] text-white/50 w-7 text-center tabular-nums">{fontSize}</span>
              <button onClick={() => changeFontSize(2)} className="w-6 h-6 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 text-[14px] font-bold transition-all" title="放大字号">A⁺</button>
            </div>
            <div className="w-px h-5 bg-white/20 mx-0.5" />
            {/* Fill color */}
            <span className="text-[9px] text-white/30 mr-0.5">填充</span>
            {TEXT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => handleColorChange(c)}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  textColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            <div className="w-px h-5 bg-white/20 mx-0.5" />
            {/* Stroke toggle + stroke color */}
            <button
              onClick={toggleStroke}
              className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] transition-all ${
                strokeEnabled ? 'text-white/80' : 'text-white/30 line-through'
              }`}
              title={strokeEnabled ? '描边已启用（点击关闭）' : '描边已关闭（点击启用）'}
            >
              <span className={`w-3 h-3 rounded-full border ${strokeEnabled ? 'bg-current border-current' : 'border-white/30'}`} />
              描边
            </button>
            {strokeEnabled && (
              <>
                {TEXT_COLORS.map(c => (
                  <button
                    key={'s' + c}
                    onClick={() => handleStrokeColorChange(c)}
                    className={`w-3.5 h-3.5 rounded-full border transition-all ${
                      strokeColor === c ? 'border-white scale-110' : 'border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    title={`描边 ${c}`}
                  />
                ))}
              </>
            )}
          </>
        )}
        {(tool === 'text' || selectedTextId) && (
          <div className="w-px h-5 bg-white/20 mx-0.5" />
        )}
        {selectedTextId && (
          <button
            onClick={deleteSelectedText}
            className="px-2 py-1.5 rounded-lg text-[12px] text-red-400 hover:text-red-300 hover:bg-white/10 transition-all flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除文字
          </button>
        )}
        <div className="w-px h-5 bg-white/20 mx-1" />

        {/* Crop actions */}
        {tool === 'crop' && cropFrame && (
          <>
            <button onClick={applyCrop} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500/80 text-white hover:bg-emerald-500 transition-all">
              确认裁剪
            </button>
            <button onClick={() => { setCropFrame(null); setDragMode('none'); }} className="px-3 py-1.5 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/10 transition-all">
              取消
            </button>
          </>
        )}

        {/* Blur undo */}
        {tool === 'blur' && blurs.length > 0 && (
          <button onClick={() => setBlurs(prev => prev.slice(0, -1))} className="px-2 py-1.5 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/10 transition-all">
            撤销模糊 ({blurs.length})
          </button>
        )}
        {tool !== 'view' && !cropFrame && (
          <button onClick={() => { setTool('view'); setCropFrame(null); setDragMode('none'); setTextPos(null); setEditingTextId(null); }} className="px-2 py-1.5 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/10 transition-all">
            完成
          </button>
        )}
        <div className="w-px h-5 bg-white/20 mx-1" />

        <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下载
        </button>
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/10 transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ---- Canvas area ---- */}
      <div ref={containerRef} className="relative" style={{ width: displayW, height: displayH }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (dragMode !== 'none') handleMouseUp(); }}
          className={`w-full h-full ${cursorClass}`}
        />

        {/* Text input overlay */}
        {textPos && (
          <div
            className="absolute z-10"
            style={{
              left: (textPos.x / img.width) * displayW,
              top: (textPos.y / img.height) * displayH - 2,
            }}
          >
            <input
              autoFocus
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') { setTextPos(null); setEditingTextId(null); setSelectedTextId(null); }
              }}
              placeholder={editingTextId ? '修改文字后按 Enter 确认' : '输入文字后按 Enter 确认'}
              className="text-[14px] px-3 py-2 rounded-lg border-2 border-emerald-400 bg-white/95 shadow-xl outline-none min-w-[200px] backdrop-blur"
              style={{ fontSize: Math.min(fontSize, 24) + 'px' }}
            />
          </div>
        )}
      </div>

      {/* ---- Bottom info bar ---- */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/50 text-white/80 text-[12px] backdrop-blur">
        {title} · {img.width}×{img.height}
        {(blurs.length > 0 || texts.length > 0) && <span className="text-white/50"> · 已编辑</span>}
        {selectedTextId && <span className="text-emerald-400"> · 文字已选中（拖拽移动 | 拖拽蓝框右下角缩放 | 点红×或按 Delete 删除 | 双击编辑）</span>}
      </div>

      {/* ---- Tool hints ---- */}
      {tool === 'crop' && !cropFrame && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/40 text-[11px]">
          拖动框选裁剪区域，拖动角点可调整大小，点击确认裁剪应用
        </div>
      )}
      {tool === 'crop' && cropFrame && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/40 text-[11px]">
          拖动角点调整大小 · 拖动框内移动位置 · 点击确认裁剪应用
        </div>
      )}
      {tool === 'blur' && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/40 text-[11px]">
          拖动框选要模糊的区域，松开即应用
        </div>
      )}
      {tool === 'text' && !textPos && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/40 text-[11px]">
          点击空白处新建文字 · 单击选中 · 双击编辑 · 拖拽移动 · 拖拽蓝框右下角缩放 · 点红×或按 Delete 删除
        </div>
      )}
    </div>
  );
}
