// 共享的开场背景：浮动光球 + 星星粒子
const stars = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  delay: `${Math.random() * 4}s`,
  duration: `${2 + Math.random() * 3}s`,
}));

const orbs = [
  { color: 'rgba(59,130,246,0.25)', size: 320, left: '10%', top: '15%', anim: 'floatOrb1', dur: '14s' },
  { color: 'rgba(6,182,212,0.2)', size: 260, left: '75%', top: '60%', anim: 'floatOrb2', dur: '16s' },
  { color: 'rgba(139,92,246,0.18)', size: 220, left: '50%', top: '80%', anim: 'floatOrb3', dur: '18s' },
  { color: 'rgba(59,130,246,0.2)', size: 280, left: '85%', top: '10%', anim: 'floatOrb1', dur: '15s' },
  { color: 'rgba(6,182,212,0.22)', size: 200, left: '25%', top: '70%', anim: 'floatOrb2', dur: '20s' },
];

export default function IntroBackground() {
  return (
    <>
      {orbs.map((orb, i) => (
        <div
          key={`orb-${i}`}
          className="login-bg-orb"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.left,
            top: orb.top,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            animation: `${orb.anim} ${orb.dur} ease-in-out infinite, orbBreathe ${orb.dur} ease-in-out infinite`,
          }}
        />
      ))}
      {stars.map(star => (
        <div
          key={`star-${star.id}`}
          className="login-star"
          style={{
            left: star.left,
            top: star.top,
            animation: `twinkle ${star.duration} ease-in-out ${star.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}
