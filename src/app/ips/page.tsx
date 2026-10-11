'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IPListSidebar from '@/components/ip/IPListSidebar';
import IPDetailPanel from '@/components/ip/IPDetailPanel';

export default function IPWorkspacePage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const router = useRouter();

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: IP List Sidebar */}
      <IPListSidebar
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreateClick={() => router.push('/ips/new')}
      />

      {/* Right: IP Detail Panel or Empty State */}
      {selectedId ? (
        <IPDetailPanel ipId={selectedId} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center mb-5">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-[16px] font-bold text-gray-700 mb-1">IP 资源工作台</h3>
          <p className="text-[13px] text-gray-500 mb-5">统一管理学员 IP、平台账号、内容素材与跟进记录</p>
          <p className="text-[12px] text-gray-500">← 从左侧选择一个学员或 IP 开始查看</p>
        </div>
      )}
    </div>
  );
}
