'use client';
import { useMemo } from 'react';

interface Particle {
  id: number;
  left: number;
  top: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  color: string;
}

export default function CosmicBackground() {
  const particles: Particle[] = useMemo(() => {
    const colors = [
      'bg-emerald-400/20', 'bg-cyan-400/15', 'bg-amber-400/15',
      'bg-black/[0.04]', 'bg-emerald-300/10', 'bg-amber-300/10',
    ];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.4 + 0.1,
      duration: Math.random() * 6 + 4,
      delay: Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className={`absolute rounded-full ${p.color}`}
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `breathe ${p.duration}s ease-in-out ${p.delay}s infinite`,
            willChange: 'opacity',
          }}
        />
      ))}
    </div>
  );
}
