'use client';
import { useState, useEffect, FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
  status: string;
  phone: string;
  last_login_at: string | null;
  created_at: string;
}

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员', admin: '管理员', operator: '运营人员', business: '商务人员', readonly: '只读人员',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ username: '', password: '', display_name: '', role: 'operator', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resetPwTarget, setResetPwTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = () => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(loadUsers, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser && !formData.username) { setError('用户名不能为空'); return; }
    setSaving(true); setError('');
    try {
      const url = editUser ? `/api/users/${editUser.id}` : '/api/users';
      const body = editUser
        ? { display_name: formData.display_name, role: formData.role, status: formData.status }
        : { ...formData };
      const res = await fetch(url, { method: editUser ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '保存失败'); }
      setShowForm(false); setEditUser(null); loadUsers();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const handleResetPw = async () => {
    if (!resetPwTarget || !newPassword) return;
    await fetch(`/api/users/${resetPwTarget.id}/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_password: newPassword }),
    });
    setResetPwTarget(null); setNewPassword('');
  };

  const openNew = () => {
    setEditUser(null);
    setFormData({ username: '', password: '', display_name: '', role: 'operator', status: 'active' });
    setShowForm(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setFormData({ username: u.username, password: '', display_name: u.display_name, role: u.role, status: u.status });
    setShowForm(true);
  };

  if (loading) return <p className="text-[13px] text-gray-500 text-center py-20">加载中...</p>;

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-bold text-gray-800">用户权限</h1>
        <Button size="sm" onClick={openNew}>新增用户</Button>
      </div>

      {users.length === 0 ? (
        <div className="glass-card py-20 text-center">
          <div className="text-4xl mb-4 opacity-60">👥</div>
          <p className="text-[14px] text-gray-500">暂无用户</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="glass-page-card">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">用户名</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">显示名</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">角色</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">状态</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">手机号</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">最近登录</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">创建时间</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/[0.04] transition-colors">
                  <td className="px-4 py-3 text-[13px] font-medium text-gray-700">{u.username}</td>
                  <td className="px-4 py-3 text-[13px] text-gray-600">{u.display_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-medium ${u.role === 'super_admin' ? 'bg-red-500/15 text-red-400 border-red-400/20' : u.role === 'admin' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-400/20' : 'glass-page-card text-gray-500'}`}>{roleLabels[u.role] || u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] ${u.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-400'}`}>{u.status === 'active' ? '正常' : '待审核'}</span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-gray-500">{u.phone || '-'}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">{u.last_login_at || '从未登录'}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">{u.created_at}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(u)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-600 rounded-lg hover:bg-black/5">编辑</button>
                    <button onClick={() => { setResetPwTarget(u); setNewPassword(''); }} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-600 rounded-lg hover:bg-black/5">重置密码</button>
                    {u.status === 'disabled' && (
                      <button onClick={async () => {
                        await fetch(`/api/users/${u.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: u.display_name, role: u.role, status: 'active' }) });
                        loadUsers();
                      }} className="px-2 py-1 text-[12px] text-emerald-600 hover:text-emerald-300 rounded-lg hover:bg-emerald-500/10">审核通过</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditUser(null); }} title={editUser ? '编辑用户' : '新增用户'}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="p-3 bg-red-500/10 border border-red-400/20 rounded-2xl text-[13px] text-red-400">{error}</div>}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">用户名</label>
            <input type="text" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })}
              className="input-glass w-full" disabled={!!editUser} placeholder="请输入用户名" />
          </div>
          {!editUser && (
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">密码</label>
              <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="input-glass w-full" placeholder="至少6位" />
            </div>
          )}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">显示名</label>
            <input type="text" value={formData.display_name} onChange={e => setFormData({ ...formData, display_name: e.target.value })}
              className="input-glass w-full" placeholder="可选" />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">角色</label>
            <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="input-glass w-full">
              {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">状态</label>
            <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="input-glass w-full">
              <option value="active">正常</option>
              <option value="disabled">禁用</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" size="sm" disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setShowForm(false); setEditUser(null); }}>取消</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!resetPwTarget} onClose={() => setResetPwTarget(null)} title="重置密码">
        <div className="space-y-3">
          <p className="text-[13px] text-gray-500">重置用户「{resetPwTarget?.username}」的密码</p>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className="input-glass w-full" placeholder="请输入新密码（至少6位）" />
          <Button size="sm" onClick={handleResetPw} disabled={newPassword.length < 6}>确认重置</Button>
        </div>
      </Modal>
    </div>
  );
}
