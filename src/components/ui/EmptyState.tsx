interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  type?: 'default' | 'search' | 'data' | 'folder' | 'recycle' | 'lock';
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles: Record<string, { container: string; svg: string; title: string; desc: string }> = {
  sm: { container: 'py-8', svg: 'w-14 h-14 mb-3', title: 'text-[14px]', desc: 'text-[12px] mb-3 max-w-[220px]' },
  md: { container: 'py-16', svg: 'w-20 h-20 mb-4', title: 'text-[15px]', desc: 'text-[13px] mb-5 max-w-sm' },
  lg: { container: 'py-24', svg: 'w-28 h-28 mb-5', title: 'text-[18px]', desc: 'text-[14px] mb-6 max-w-md' },
};

function Illustration({ type }: { type: string }) {
  switch (type) {
    case 'search':
      return (
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="12" y="22" width="42" height="48" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <line x1="18" y1="33" x2="44" y2="33" stroke="currentColor" strokeWidth="1.2" opacity="0.18" />
          <line x1="18" y1="40" x2="40" y2="40" stroke="currentColor" strokeWidth="1.2" opacity="0.18" />
          <line x1="18" y1="47" x2="36" y2="47" stroke="currentColor" strokeWidth="1.2" opacity="0.18" />
          <g opacity="0.6">
            <animateTransform attributeName="transform" type="translate" values="0,0;2,-2;0,0" dur="4s" repeatCount="indefinite" />
            <circle cx="54" cy="38" r="14" stroke="currentColor" strokeWidth="1.5" />
            <line x1="64" y1="48" x2="75" y2="59" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      );

    case 'data':
      return (
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="16" y1="8" x2="16" y2="64" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <line x1="16" y1="64" x2="72" y2="64" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <rect x="10" y="66" width="64" height="6" rx="2" fill="currentColor" opacity="0.06" />
          <g opacity="0.5">
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-3;0,0" dur="3.5s" repeatCount="indefinite" />
            <rect x="22" y="44" width="10" height="20" rx="2" fill="currentColor" opacity="0.25" />
            <rect x="36" y="34" width="10" height="30" rx="2" fill="currentColor" opacity="0.35" />
            <rect x="50" y="24" width="10" height="40" rx="2" fill="currentColor" opacity="0.45" />
          </g>
        </svg>
      );

    case 'folder':
      return (
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g opacity="0.5">
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-2;0,0" dur="4s" repeatCount="indefinite" />
            <path d="M14 20C14 17.7909 15.7909 16 18 16H32L38 22H62C64.2091 22 66 23.7909 66 26V58C66 60.2091 64.2091 62 62 62H18C15.7909 62 14 60.2091 14 58V20Z" stroke="currentColor" strokeWidth="1.5" />
          </g>
          <g opacity="0.7">
            <animateTransform attributeName="transform" type="scale" values="1;1.25;1" dur="2s" repeatCount="indefinite" additive="sum" />
            <animateTransform attributeName="transform" type="translate" values="0,0;-4.5,-4.5;0,0" dur="2s" repeatCount="indefinite" additive="sum" />
            <path d="M56 14L60 10L64 14L60 18Z" fill="currentColor" />
          </g>
        </svg>
      );

    case 'recycle':
      return (
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g opacity="0.5">
            <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="20s" repeatCount="indefinite" />
            <path d="M40 18L52 38H28L40 18Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M28 42L16 62H40L28 42Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M52 42L64 62H40L52 42Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </g>
          <circle cx="40" cy="40" r="30" stroke="currentColor" strokeWidth="1" opacity="0.12" strokeDasharray="4 4" />
        </svg>
      );

    case 'lock':
      return (
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g opacity="0.5">
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-1.5;0,0" dur="4.5s" repeatCount="indefinite" />
            <rect x="24" y="36" width="32" height="28" rx="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M28 36V28C28 21.3726 33.3726 16 40 16C46.6274 16 52 21.3726 52 28V36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="40" cy="50" r="3" fill="currentColor" opacity="0.6" />
            <line x1="40" y1="52" x2="40" y2="56" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          {[
            [40, 16, 1.8], [26, 22, 1.2], [56, 18, 1.4], [18, 36, 1.0], [62, 34, 1.3],
            [30, 46, 1.5], [52, 44, 1.1], [40, 30, 1.6], [24, 58, 1.2], [58, 56, 1.0],
            [46, 60, 1.4], [34, 62, 0.9], [40, 52, 1.7],
          ].map(([cx, cy, r], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="currentColor" opacity={0.12 + (i * 0.04)}>
              <animate attributeName="opacity" values={`${0.05 + (i % 5) * 0.03};${0.2 + (i % 5) * 0.06};${0.05 + (i % 5) * 0.03}`} dur={`${2.5 + (i % 4) * 0.7}s`} repeatCount="indefinite" begin={`${i * 0.15}s`} />
            </circle>
          ))}
          <circle cx="40" cy="40" r="28" stroke="currentColor" strokeWidth="0.5" opacity="0.08" strokeDasharray="3 5" />
        </svg>
      );
  }
}

export default function EmptyState({ icon, title, description, action, type = 'default', size = 'md' }: Props) {
  const styles = sizeStyles[size];
  const showEmoji = icon && type === 'default' && icon !== '📭';

  return (
    <div className={`flex flex-col items-center justify-center text-center ${styles.container}`}>
      {showEmoji ? (
        <div className={`${styles.svg} flex items-center justify-center text-4xl opacity-60`}>{icon}</div>
      ) : (
        <div className={`${styles.svg} text-gray-600`}>
          <Illustration type={type} />
        </div>
      )}
      <h3 className={`${styles.title} font-semibold text-gray-600 mb-1`}>{title}</h3>
      {description && <p className={`${styles.desc} text-gray-500`}>{description}</p>}
      {action}
    </div>
  );
}
