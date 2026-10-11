'use client';
import { useState } from 'react';

interface Props {
  labels: string[];
  contentCreated: number[];
  materialsAdded: number[];
}

export default function TrendChart({ labels, contentCreated, materialsAdded }: Props) {
  const [range, setRange] = useState<7 | 30 | 90>(30);

  const start = range === 90 ? 0 : 30 - range;
  const slicedLabels = labels.slice(start);
  const slicedContent = contentCreated.slice(start);
  const slicedMaterials = materialsAdded.slice(start);

  const allValues = [...slicedContent, ...slicedMaterials];
  const maxVal = Math.max(...allValues, 1);

  const w = 600; const h = 200; const padLeft = 32; const padRight = 16; const padTop = 12; const padBottom = 20;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const toX = (i: number) => padLeft + (i / (slicedLabels.length - 1 || 1)) * plotW;
  const toY = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  const buildPath = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  const yTicks = [0, Math.round(maxVal / 3), Math.round((maxVal * 2) / 3), maxVal].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[14px] font-semibold text-gray-700">内容生产趋势</h4>
        <div className="flex gap-1 rounded-lg p-0.5 border border-black/10" style={{ background: 'rgba(0,0,0,0.04)' }}>
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                range === d ? 'bg-white/90 text-gray-700 shadow-sm border border-black/10 backdrop-blur-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {d === 90 ? '近90天' : `近${d}天`}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padLeft} y1={toY(v)} x2={w - padRight} y2={toY(v)} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />
            <text x={padLeft - 4} y={toY(v) + 3} textAnchor="end" className="text-[9px]" fill="#758288">{v}</text>
          </g>
        ))}
        {/* materials area */}
        <path d={`${buildPath(slicedMaterials)} L${toX(slicedLabels.length - 1)},${toY(0)} L${toX(0)},${toY(0)} Z`}
          fill="url(#matGrad)" opacity={0.5} />
        <path d={buildPath(slicedMaterials)} fill="none" stroke="#06b6d4" strokeWidth={1.5} />
        {/* content line */}
        <path d={buildPath(slicedContent)} fill="none" stroke="#10b981" strokeWidth={1.8} />
        <defs>
          <linearGradient id="matGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center justify-center gap-6 mt-2">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-0.5 rounded-full bg-emerald-500 inline-block" /> 发布内容
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-2.5 h-0.5 rounded-full bg-cyan-500 inline-block" /> 新增素材
        </div>
      </div>
    </div>
  );
}
