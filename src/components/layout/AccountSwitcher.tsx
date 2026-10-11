'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@/lib/UserContext';
import Modal from '@/components/ui/Modal';

interface UserItem {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员', admin: '管理员', operator: '运营人员', business: '商务人员', readonly: '只读人员',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AccountSwitcher({ open, onClose }: Props) {
  const { user: currentUser, switchUser } = useUser();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      fetch('/api/users')
        .then(r => r.ok ? r.json() : [])
        .then(data => setUsers(Array.isArray(data) ? data : []))
        .catch(() => {});
      setSearch('');
      setError('');
    }
  }, [open]);

  const handleSwitch = async (targetUserId: number) => {
    setSwitching(true); setError('');
    try {
      await switchUser(targetUserId);
    } catch (err) {
      setError((err as Error).message);
      setSwitching(false);
    }
  };

  const filtered = users.filter(u =>
    u.id !== currentUser?.id &&
    (search === '' || u.username.includes(search) || u.display_name.includes(search))
  );

  return (
    <Modal open={open} onClose={onClose} title="切换账号">
      <div className="space-y-3">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-[13px] text-red-600">{error}</div>}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-glass w-full"
          placeholder="搜索用户..."
        />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-[13px] text-gray-500 text-center py-4">暂无其他活跃用户</p>
          ) : (
            filtered.map(u => (
              <button
                key={u.id}
                type="button"
                disabled={switching}
                onClick={() => handleSwitch(u.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-cyan-100 flex items-center justify-center text-xs font-bold text-emerald-600 flex-shrink-0">
                  {(u.display_name || u.username).charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-700 truncate">{u.display_name || u.username}</div>
                  <div className="text-[11px] text-gray-500">@{u.username} · {roleLabels[u.role] || u.role}</div>
                </div>
                <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
