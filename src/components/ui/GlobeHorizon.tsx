'use client';

export default function GlobeHorizon() {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 pointer-events-none z-0 overflow-hidden"
      style={{ width: '140vw', height: '70vw', maxWidth: '1400px', maxHeight: '700px' }}>
      <svg
        viewBox="0 0 1200 1200"
        className="w-full h-full"
        style={{ transform: 'translateY(55%)' }}
      >
        <defs>
          {/* Ocean gradient */}
          <radialGradient id="oceanGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0b3d5f" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#061e33" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#020c17" stopOpacity="1" />
          </radialGradient>
          {/* Atmosphere glow */}
          <radialGradient id="atmosGrad" cx="50%" cy="50%" r="50%">
            <stop offset="85%" stopColor="transparent" />
            <stop offset="93%" stopColor="rgba(56,189,248,0.25)" />
            <stop offset="97%" stopColor="rgba(56,189,248,0.5)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.15)" />
          </radialGradient>
          {/* Land gradient */}
          <radialGradient id="landGrad" cx="45%" cy="45%" r="55%">
            <stop offset="0%" stopColor="rgba(34,197,94,0.35)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.15)" />
          </radialGradient>
          {/* Shine highlight */}
          <radialGradient id="shineGrad" cx="35%" cy="30%" r="40%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          {/* Clip to hide bottom half */}
          <clipPath id="globeClip">
            <rect x="0" y="0" width="1200" height="1200" />
          </clipPath>
        </defs>

        {/* Grid lines group - rotates */}
        <g className="globe-rotate" style={{ transformOrigin: '600px 600px' }}>
          {/* Ocean base */}
          <circle cx="600" cy="600" r="580" fill="url(#oceanGrad)" />

          {/* Land shapes - abstract continent outlines */}
          <g opacity="0.5">
            {/* Eurasia-like shape */}
            <path d="M280 340 Q320 300 380 290 Q450 280 520 300 Q580 320 600 350 Q620 380 600 420 Q570 460 500 470 Q430 480 380 450 Q320 420 280 380 Z"
              fill="url(#landGrad)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
            {/* North America-like */}
            <path d="M150 250 Q200 210 280 200 Q340 200 360 240 Q370 280 340 320 Q300 350 240 340 Q180 320 150 280 Z"
              fill="url(#landGrad)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
            {/* South America-like */}
            <path d="M250 520 Q280 500 300 520 Q310 560 290 600 Q270 630 260 600 Q240 560 250 520 Z"
              fill="url(#landGrad)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
            {/* Africa-like */}
            <path d="M440 400 Q470 380 500 400 Q520 440 510 500 Q490 550 460 560 Q440 540 430 480 Q420 430 440 400 Z"
              fill="url(#landGrad)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
            {/* Australia-like */}
            <path d="M700 480 Q730 470 750 490 Q760 510 740 530 Q710 540 690 520 Q680 500 700 480 Z"
              fill="url(#landGrad)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
            {/* Small islands / dots */}
            <circle cx="780" cy="350" r="5" fill="rgba(34,197,94,0.3)" />
            <circle cx="790" cy="345" r="3" fill="rgba(34,197,94,0.25)" />
            <circle cx="340" cy="550" r="4" fill="rgba(34,197,94,0.3)" />
            <circle cx="620" cy="570" r="3" fill="rgba(34,197,94,0.25)" />
            <circle cx="170" cy="420" r="3" fill="rgba(34,197,94,0.3)" />
          </g>

          {/* Latitude lines */}
          {[150, 250, 350, 450, 550, 650, 750, 850, 950, 1050].map((y, i) => {
            const dy = y - 600;
            const r = Math.sqrt(580 * 580 - dy * dy);
            return (
              <ellipse key={`lat-${i}`} cx="600" cy={y} rx={r} ry={Math.abs(dy) * 0.15 + 1}
                fill="none" stroke="rgba(56,189,248,0.12)" strokeWidth="0.5" />
            );
          })}

          {/* Longitude lines */}
          {[-60, -40, -20, 0, 20, 40, 60, 80].map((angle, i) => (
            <g key={`lon-${i}`}>
              <ellipse cx="600" cy="600" rx="580" ry={580 * 0.35}
                fill="none" stroke="rgba(56,189,248,0.1)" strokeWidth="0.5"
                transform={`rotate(${angle} 600 600)`} />
            </g>
          ))}

          {/* Equator highlight */}
          <ellipse cx="600" cy="600" rx="580" ry="20"
            fill="none" stroke="rgba(56,189,248,0.2)" strokeWidth="1" />
        </g>

        {/* Atmosphere glow ring */}
        <circle cx="600" cy="600" r="580" fill="url(#atmosGrad)" />

        {/* Top shine */}
        <circle cx="600" cy="600" r="580" fill="url(#shineGrad)" />

        {/* Horizon glow - fades out at the bottom curve */}
        <ellipse cx="600" cy="1180" rx="700" ry="60" fill="rgba(2,6,23,1)" />
        <ellipse cx="600" cy="1170" rx="680" ry="40" fill="rgba(2,6,23,0.8)" />

        {/* Bottom fade mask to blend with background */}
        <defs>
          <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1200" height="1200" fill="url(#fadeBottom)" />
      </svg>
    </div>
  );
}
