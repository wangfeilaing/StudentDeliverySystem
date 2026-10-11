'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import HeaderBar from './HeaderBar';
import ImpersonationBanner from './ImpersonationBanner';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isPublic = pathname === '/login' || pathname === '/register';
  const isDashboard = pathname === '/';

  if (isPublic) return <>{children}</>;

  const isWorkspace = pathname === '/ips';

  return (
    <div className="h-full flex flex-col relative" style={{
      backgroundImage: 'url(/dashboard-bg.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }}>
      {/* Ambient atmosphere — cool cyan on left, clean light base */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(circle at 16% 42%, rgba(35, 166, 220, 0.14), transparent 44%),
            radial-gradient(circle at 50% 80%, rgba(255, 255, 255, 0.30), transparent 34%),
            linear-gradient(135deg, rgba(238, 245, 244, 0.48) 0%, rgba(219, 232, 232, 0.40) 48%, rgba(232, 237, 236, 0.40) 100%)
          `
        }} />
      <ImpersonationBanner />
      <HeaderBar />
      <div className="flex-1 flex min-h-0 relative z-10">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className={`flex-1 min-w-0 relative ${isWorkspace ? 'overflow-hidden' : 'overflow-auto'}`}>
          {isWorkspace ? (
            children
          ) : (
            <div className="relative z-10 min-h-full">
              <div className="px-4 md:px-6 lg:px-8 py-5 w-full">
                {children}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
