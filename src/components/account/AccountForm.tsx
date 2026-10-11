'use client';
import { useState, FormEvent } from 'react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

const platformOptions = [
  { value: '', label: '选择平台' },
  { value: 'B站', label: 'B站' }, { value: '抖音', label: '抖音' }, { value: 'YouTube', label: 'YouTube' },
  { value: '小红书', label: '小红书' }, { value: '微博', label: '微博' }, { value: '快手', label: '快手' },
  { value: '微信视频号', label: '微信视频号' }, { value: 'TikTok', label: 'TikTok' }, { value: 'Instagram', label: 'Instagram' }, { value: '其他', label: '其他' },
];

interface AccountData { id?: number; platform: string; account_name: string; account_url: string; follower_count: number; notes: string; }
interface Props { ipId: number; initial?: AccountData; onSuccess: () => void; onCancel: () => void; }

export default function AccountForm({ ipId, initial, onSuccess, onCancel }: Props) {
  const [platform, setPlatform] = useState(initial?.platform || '');
  const [accountName, setAccountName] = useState(initial?.account_name || '');
  const [accountUrl, setAccountUrl] = useState(initial?.account_url || '');
  const [followerCount, setFollowerCount] = useState(String(initial?.follower_count || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!platform || !accountName.trim()) { setError('平台和账号名不能为空'); return; }
    setSaving(true); setError('');
    const body = { platform, account_name: accountName.trim(), account_url: accountUrl.trim(), follower_count: parseInt(followerCount, 10) || 0, notes: '' };
    try {
      const url = initial?.id ? `/api/accounts/${initial.id}` : `/api/ips/${ipId}/accounts`;
      const method = initial?.id ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || '操作失败'); }
      onSuccess();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="p-3 bg-red-500/10 border border-red-400/20 rounded-2xl text-[13px] text-red-400">{error}</div>}
      <Select label="平台 *" value={platform} onChange={e => setPlatform(e.target.value)} options={platformOptions} />
      <Input label="账号名 *" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="如: @zhangsan" />
      <Input label="账号链接" value={accountUrl} onChange={e => setAccountUrl(e.target.value)} placeholder="https://..." />
      <Input label="粉丝数" type="number" value={followerCount} onChange={e => setFollowerCount(e.target.value)} />
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? '保存中...' : initial?.id ? '更新' : '添加'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}
