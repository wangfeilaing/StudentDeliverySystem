'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AccountForm from './AccountForm';

interface Account { id: number; platform: string; account_name: string; account_url: string; follower_count: number; notes: string; }
interface Props { ipId: number; accounts: Account[]; }

export default function AccountList({ ipId, accounts: initialAccounts }: Props) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await fetch(`/api/accounts/${deleteTarget.id}`, { method: 'DELETE' }); setAccounts(prev => prev.filter(a => a.id !== deleteTarget.id)); router.refresh(); } catch {}
    setDeleting(false); setDeleteTarget(null);
  };
  const handleSuccess = () => { router.refresh(); setShowForm(false); setEditAccount(null); };

  if (accounts.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-[13px] text-gray-500 mb-4">还没有添加账号</p>
        <Button size="sm" onClick={() => setShowForm(true)}>添加账号</Button>
        <Modal open={showForm} onClose={() => setShowForm(false)} title="添加社交账号">
          <AccountForm ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setShowForm(true)}>添加账号</Button>
      </div>
      <div className="rounded-2xl overflow-hidden border border-black/5">
        <table className="w-full">
          <thead>
            <tr className="bg-black/5">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">平台</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">账号名</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">粉丝数</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {accounts.map(acc => (
              <tr key={acc.id} className="hover:bg-black/5 transition-colors">
                <td className="px-4 py-3 text-[13px] font-semibold text-gray-700">{acc.platform}</td>
                <td className="px-4 py-3 text-[13px] text-gray-600">@{acc.account_name}{acc.account_url && <a href={acc.account_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[12px] text-emerald-500 hover:underline">链接</a>}</td>
                <td className="px-4 py-3 text-[13px] text-gray-500">{(acc.follower_count || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditAccount(acc)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-600 rounded-lg hover:bg-black/5 transition-colors">编辑</button>
                  <button onClick={() => setDeleteTarget(acc)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="添加社交账号">
        <AccountForm ipId={ipId} onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />
      </Modal>
      <Modal open={!!editAccount} onClose={() => setEditAccount(null)} title="编辑社交账号">
        {editAccount && <AccountForm ipId={ipId} initial={editAccount} onSuccess={handleSuccess} onCancel={() => setEditAccount(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="删除账号" message={`确定要删除「${deleteTarget?.platform} @${deleteTarget?.account_name}」吗？`} loading={deleting} />
    </div>
  );
}
