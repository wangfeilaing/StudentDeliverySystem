'use client';
import { useState, useEffect } from 'react';

interface LogEntry {
  id: number;
  username: string;
  action: string;
  target_type: string;
  detail: string;
  created_at: string;
}

interface Props {
  ipId: number;
}

const actionLabels: Record<string, string> = {
  'create': '新增',
  'update': '编辑',
  'delete': '删除',
  'upload': '上传',
  'download': '下载',
};

const actionColors: Record<string, string> = {
  'create': 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/20',
  'update': 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/20',
  'delete': 'bg-red-500/10 text-red-400 border border-red-400/20',
  'upload': 'bg-cyan-500/15 text-cyan-400 border border-cyan-400/20',
  'download': 'bg-purple-500/15 text-purple-400 border border-purple-400/20',
};

export default function OperationLogList({ ipId }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ips/${ipId}/logs`)
      .then(r => r.json())
      .then(data => setLogs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ipId]);

  if (loading) {
    return <p className="text-[13px] text-gray-500 text-center py-10">加载中...</p>;
  }

  if (logs.length === 0) {
    return <p className="text-[13px] text-gray-500 text-center py-10">暂无操作记录</p>;
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-black/5">
      <table className="w-full">
        <thead>
          <tr className="bg-black/5">
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">时间</th>
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">操作人</th>
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">操作</th>
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">详情</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {logs.map(log => (
            <tr key={log.id} className="hover:bg-black/5 transition-colors">
              <td className="px-4 py-2.5 text-[12px] text-gray-500">{log.created_at}</td>
              <td className="px-4 py-2.5 text-[12px] text-gray-600">{log.username}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-medium ${actionColors[log.action] || 'bg-black/5 text-gray-500'}`}>
                  {actionLabels[log.action] || log.action}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-gray-500">{log.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
