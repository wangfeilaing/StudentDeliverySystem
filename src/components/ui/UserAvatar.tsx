'use client';
import { useState, useRef } from 'react';

interface Props {
  userId: number;
  avatarPath: string | null;
  displayName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
  online?: boolean;
}

const sizeConfig: Record<string, { container: string; text: string; rounded: string }> = {
  xs: { container: 'w-6 h-6 min-w-[24px]', text: 'text-[9px]', rounded: 'rounded-md' },
  sm: { container: 'w-8 h-8 min-w-[32px]', text: 'text-[11px]', rounded: 'rounded-lg' },
  md: { container: 'w-10 h-10 min-w-[40px]', text: 'text-[13px]', rounded: 'rounded-xl' },
  lg: { container: 'w-14 h-14 min-w-[56px]', text: 'text-lg', rounded: 'rounded-2xl' },
  xl: { container: 'w-[72px] h-[72px] min-w-[72px]', text: 'text-2xl', rounded: 'rounded-2xl' },
};

export default function UserAvatar({
  userId,
  avatarPath,
  displayName,
  size = 'md',
  ring = false,
  online = false,
}: Props) {
  const [avatar, setAvatar] = useState<string | null>(
    avatarPath ? `/api/uploads/${avatarPath}` : null
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await fetch('/api/auth/avatar', { method: 'PUT', body: formData });
      if (res.ok) {
        const data = await res.json();
        setAvatar(`/api/uploads/${data.avatar_path}?t=${Date.now()}`);
      }
    } catch {}
    setUploading(false);
  };

  const initial = displayName.charAt(0).toUpperCase();
  const config = sizeConfig[size];

  const avatarContent = (
    <div
      className="relative group cursor-pointer"
      onClick={() => fileRef.current?.click()}
      title="点击更换头像"
    >
      {avatar ? (
        <img
          src={avatar}
          alt={displayName}
          className={`${config.container} ${config.rounded} object-cover border border-slate-200`}
        />
      ) : (
        <div
          className={`${config.container} ${config.rounded} bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-white font-bold flex-shrink-0`}
        >
          {initial}
        </div>
      )}
      <div
        className={`absolute inset-0 ${config.rounded} bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}
      >
        {uploading ? (
          <span className="text-white text-[10px]">上传中...</span>
        ) : (
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
          </svg>
        )}
      </div>
      {online && (
        <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 bg-emerald-400 animate-pulse-glow rounded-full border-2 border-white" />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );

  if (ring) {
    return <div className="avatar-cosmic-ring inline-flex">{avatarContent}</div>;
  }

  return avatarContent;
}
