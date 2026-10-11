'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

interface Tab { key: string; label: string; count?: number; }

interface Props {
  tabs: Tab[];
  defaultTab?: string;
  children: (activeTab: string) => React.ReactNode;
  variant?: 'underline' | 'pills';
}

export default function Tabs({ tabs, defaultTab, children, variant = 'underline' }: Props) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.key || '');
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    if (variant !== 'underline') return;
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-tab-key="${active}"]`) as HTMLElement;
    if (!activeBtn) return;
    setIndicatorStyle({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
    });
  }, [active, variant]);

  useEffect(() => {
    updateIndicator();
    const onResize = () => updateIndicator();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateIndicator]);

  return (
    <div>
      {variant === 'underline' ? (
        <div ref={containerRef} className="relative flex border-b border-black/5 mb-5">
          {tabs.map(tab => (
            <button
              key={tab.key}
              data-tab-key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
                active === tab.key ? 'text-gray-800' : 'text-gray-500 hover:text-gray-600'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  active === tab.key ? 'bg-emerald-500/15 text-emerald-600' : 'bg-black/5 text-gray-500'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
          <span
            className="absolute bottom-0 h-[2.5px] bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-300 ease-out"
            style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
          />
        </div>
      ) : (
        <div className="flex gap-2 mb-5">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
                active === tab.key
                  ? 'bg-emerald-500/15 text-emerald-600 shadow-glow-blue'
                  : 'bg-black/5 text-gray-500 hover:text-gray-600 hover:bg-black/5'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  active === tab.key ? 'bg-emerald-500/15 text-emerald-600' : 'bg-black/5 text-gray-500'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {children(active)}
    </div>
  );
}
