'use client';
import { useUser } from '@/lib/UserContext';

export default function ImpersonationBanner() {
  const { user, impersonating, switchBack } = useUser();

  if (!impersonating || !user) return null;

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-between px-6 py-2 bg-amber-50/95 border-b border-amber-200">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[13px] text-amber-700">
          正在以 <strong>{user.display_name || user.username}</strong> 身份操作
        </span>
      </div>
      <button
        type="button"
        onClick={switchBack}
        className="px-3 py-1 rounded-lg text-[12px] font-medium bg-amber-200/60 text-amber-700 hover:bg-amber-300/60 transition-colors"
      >
        切换回原账号
      </button>
    </div>
  );
}
