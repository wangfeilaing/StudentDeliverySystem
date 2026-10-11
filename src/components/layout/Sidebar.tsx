'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/UserContext';
import { canAccessMenu } from '@/lib/permissions';
import AccountSwitcher from './AccountSwitcher';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

const allMenuItems = [
  { href: '/', label: '仪表盘', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/ips', label: 'IP 管理', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { href: '/products', label: '产品管理', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/wechat-orders', label: '流量管理', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { href: '/content', label: '内容工坊', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
  { href: '/recycle-bin', label: '回收站', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' },
  { href: '/users', label: '用户管理', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { href: '/settings', label: '系统设置', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const { user, logout, impersonating, switchBack } = useUser();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const menuItems = user
    ? allMenuItems.filter(item => canAccessMenu(user.role, item.href))
    : allMenuItems;

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  const sidebarWidth = collapsed ? 'w-[64px]' : 'w-[228px]';

  return (
    <div className="flex h-full z-10 relative">
      <div className={`${sidebarWidth} glass-sidebar flex flex-col transition-[width] duration-300 ease-out`}>
        {/* Brand */}
        <div className={`px-5 pt-5 pb-4 ${collapsed ? 'px-3 flex justify-center' : ''}`}>
          {collapsed ? (
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-[14px] font-bold text-gray-800">IP 资产管理</h1>
                <p className="text-[10px] text-gray-500 mt-0.5">资源管理平台</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5">
          {!collapsed && (
            <p className="px-2 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">导航</p>
          )}
          {menuItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group relative ${
                  collapsed ? 'justify-center px-0 py-2.5 w-full' : 'px-3 py-2.5'
                } ${
                  active
                    ? 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 text-gray-800 border border-emerald-400/20'
                    : 'text-gray-600 hover:bg-black/5 hover:text-gray-800 border border-transparent'
                } ${!collapsed ? 'hover:translate-x-[3px]' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                {/* Active indicator dot */}
                {active && (
                  <span className="absolute right-[-1px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                )}
                <svg className="w-[16px] h-[16px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={item.icon} />
                </svg>
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* New IP button */}
        <div className={`px-3 pb-3 ${collapsed ? 'flex justify-center' : ''}`}>
          <Link
            href="/ips/new"
            className={`flex items-center gap-2 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.97] ${
              collapsed ? 'justify-center w-10 h-10 p-0' : 'justify-center w-full py-2.5'
            }`}
            title={collapsed ? '新建 IP' : undefined}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {!collapsed && '新建 IP'}
          </Link>
        </div>

        {/* User area */}
        <div className="px-3 pb-4 border-t border-black/5">
          <div className={`pt-3 flex items-center ${collapsed ? 'justify-center px-0' : 'px-2 gap-2.5'}`}>
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user ? (user.display_name || user.username).charAt(0) : '?'}
              </div>
              <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white/80 animate-pulse-glow" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="text-[12px] font-medium text-gray-700 truncate">{user ? (user.display_name || user.username) : '加载中...'}</div>
                <div className="text-[10px] text-gray-500">{user ? `@${user.username}` : ''}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="mt-2 space-y-0.5">
              {impersonating ? (
                <button onClick={switchBack} className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[12px] text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-all">
                  <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                  </svg>
                  切换回原账号
                </button>
              ) : (
                <button onClick={() => setSwitcherOpen(true)} className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[12px] text-gray-600 hover:bg-black/5 hover:text-gray-800 transition-all">
                  <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  切换账号
                </button>
              )}
              <button onClick={logout} className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[12px] text-gray-600 hover:bg-red-50 hover:text-red-500 transition-all">
                <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute top-2.5 -right-3 w-6 h-6 rounded-full bg-white/80 backdrop-blur-md border border-gray-200 hover:bg-white flex items-center justify-center z-20 transition-colors"
        style={{ left: collapsed ? 52 : 215 }}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <AccountSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </div>
  );
}
