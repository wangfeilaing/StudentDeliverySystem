'use client';
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';

interface Account {
  id?: number;
  platform: string;
  account_name: string;
  account_url: string;
  follower_count: number;
}

export interface AccountManagerHandle {
  saveAccounts: () => Promise<boolean>;
}

interface Props {
  ipId: number;
}

const platforms = ['抖音', '小红书', '视频号', 'B站', '公众号', '快手', '微博', '头条', '其他'];

const AccountManager = forwardRef<AccountManagerHandle, Props>(function AccountManager({ ipId }, ref) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`/api/ips/${ipId}/accounts`)
      .then(r => r.json())
      .then(data => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ipId]);

  const addAccount = () => {
    setAccounts(prev => [...prev, { platform: '', account_name: '', account_url: '', follower_count: 0 }]);
  };

  const removeAccount = (index: number) => {
    setAccounts(prev => prev.filter((_, i) => i !== index));
  };

  const updateAccount = (index: number, field: keyof Account, value: string | number) => {
    setAccounts(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/ips/${ipId}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || '保存失败');
      }
      setMsg('账号保存成功');
      return true;
    } catch (err) {
      setMsg((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Expose saveAccounts to parent via ref
  useImperativeHandle(ref, () => ({
    saveAccounts: handleSave,
  }), [accounts]);

  if (loading) return <p className="text-[13px] text-gray-500 py-2">加载账号...</p>;

  return (
    <div>
      {msg && (
        <div className={`mb-3 p-2.5 rounded-xl text-[12px] ${msg.includes('成功') ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/20' : 'bg-red-500/10 text-red-400 border border-red-400/20'}`}>
          {msg}
        </div>
      )}

      <div className="space-y-3">
        {accounts.map((a, i) => (
          <div key={i} className="flex items-start gap-2 p-3 bg-black/5 rounded-xl border border-black/5">
            <div className="flex-1 grid grid-cols-4 gap-2">
              <select
                value={a.platform}
                onChange={e => updateAccount(i, 'platform', e.target.value)}
                className="input-glass text-[12px]"
              >
                <option value="">选择平台</option>
                {platforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                type="text"
                value={a.account_name}
                onChange={e => updateAccount(i, 'account_name', e.target.value)}
                placeholder="账号名称"
                className="input-glass text-[12px]"
              />
              <input
                type="text"
                value={a.account_url}
                onChange={e => updateAccount(i, 'account_url', e.target.value)}
                placeholder="账号链接 URL"
                className="input-glass text-[12px]"
              />
              <input
                type="number"
                value={a.follower_count || ''}
                onChange={e => updateAccount(i, 'follower_count', parseInt(e.target.value) || 0)}
                placeholder="粉丝数"
                className="input-glass text-[12px]"
              />
            </div>
            <button
              type="button"
              onClick={() => removeAccount(i)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
              title="删除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={addAccount}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500/15 text-emerald-600 border border-emerald-400/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          添加账号
        </button>
        {accounts.length > 0 && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-700 hover:to-cyan-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存账号'}
          </button>
        )}
      </div>
    </div>
  );
});

export default AccountManager;
