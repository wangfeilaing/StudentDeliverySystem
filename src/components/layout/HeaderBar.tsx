'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/lib/UserContext';
import GlobalSearch from '@/components/ui/GlobalSearch';
import UserAvatar from '@/components/ui/UserAvatar';
import NotificationBell from '@/components/layout/NotificationBell';

const breadcrumbMap: Record<string, string> = {
  '': '仪表盘',
  'ips': 'IP 管理',
  'ips-new': '新建 IP',
  'ips-id': 'IP 详情',
  'ips-id-edit': '编辑 IP',
  'recycle-bin': '回收站',
  'users': '用户管理',
  'settings': '系统设置',
};

function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: '仪表盘' }];

  const crumbs: { label: string; href?: string }[] = [{ label: '仪表盘', href: '/' }];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isId = /^\d+$/.test(seg);

    if (isId) {
      const prevSeg = segments[i - 1] || '';
      const nextSeg = segments[i + 1] || '';
      const key = nextSeg ? `${prevSeg}-id-${nextSeg}` : `${prevSeg}-id`;
      crumbs.push({ label: breadcrumbMap[key] || `#${seg}` });
    } else {
      const key = seg;
      const href = '/' + segments.slice(0, i + 1).join('/');
      crumbs.push({ label: breadcrumbMap[key] || seg, href });
    }
  }

  return crumbs;
}

export default function HeaderBar() {
  const pathname = usePathname();
  const { user } = useUser();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <header className="sticky top-0 z-40 h-[56px] flex items-center gap-4 px-5 border-b border-white/40 bg-white/45 backdrop-blur-[20px] saturate-[1.5]">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-[12px] flex-shrink-0">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {crumb.href && i < crumbs.length - 1 ? (
              <Link href={crumb.href} className="text-gray-500 hover:text-gray-700 transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className={i === crumbs.length - 1 ? 'text-gray-800 font-medium' : 'text-gray-500'}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Global Search */}
      <div className="w-64">
        <GlobalSearch />
      </div>

      {/* Notification bell */}
      <NotificationBell />

      {/* User Avatar */}
      {user && (
        <div className="flex items-center gap-2.5 pl-1">
          <UserAvatar
            userId={user.id}
            avatarPath={user.avatar_path}
            displayName={user.display_name || user.username}
            size="sm"
          />
          <span className="text-[12px] text-gray-600 hidden lg:block">{user.display_name || user.username}</span>
        </div>
      )}
    </header>
  );
}
