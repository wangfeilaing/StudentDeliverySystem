'use client';
import { useState, useEffect, FormEvent, useRef } from 'react';
import { useUser } from '@/lib/UserContext';
import Button from '@/components/ui/Button';
import ImageCropper from '@/components/ui/ImageCropper';

export default function SettingsPage() {
  const { user } = useUser();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupStatus, setBackupStatus] = useState<{
    enabled: boolean;
    retentionDays: number;
    lastBackupAt: string | null;
    nextDueAt: string | null;
    backups: Array<{ fileName: string; sizeBytes: number; createdAt: string }>;
    dbSizeBytes: number;
  } | null>(null);
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);

  // Feishu OAuth state（authorized 现在表示「令牌真的可用」，不再只看字段是否存在）
  const [feishuAuthStatus, setFeishuAuthStatus] = useState<{
    authorized: boolean;
    expiresAt: number | null;
    state?: 'ok' | 'not_authorized' | 'expired' | 'unreachable';
    message?: string;
    needsReauth?: boolean;
  } | null>(null);
  const [feishuAuthMsg, setFeishuAuthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      setSettings(data.settings || {});
      setStats(data.stats || {});
    }).catch(() => {}).finally(() => setLoading(false));
    loadBackupStatus();
  }, []);

  // Check Feishu OAuth status on mount and handle callback query params
  useEffect(() => {
    fetch('/api/settings/feishu-auth-status').then(r => r.json()).then(data => {
      setFeishuAuthStatus(data);
    }).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.has('feishu_auth_success')) {
      setFeishuAuthMsg({ type: 'success', text: '飞书授权成功！现在可以将文档创建到知识库中了。' });
      window.history.replaceState({}, '', '/settings');
    } else if (params.has('feishu_auth_error')) {
      setFeishuAuthMsg({ type: 'error', text: params.get('feishu_auth_error') || '授权失败' });
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    setSaving(false);
  };

  const handleBackup = async () => {
    setBackupMsg('正在备份数据库...');
    try {
      const res = await fetch('/api/settings/backup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setBackupMsg(data.error || '备份失败');
        return;
      }
      setBackupMsg(`备份完成：${data.backup.fileName}（${(data.backup.sizeBytes / 1024 / 1024).toFixed(1)} MB）`);
      loadBackupStatus();
    } catch {
      setBackupMsg('备份失败');
    }
  };

  const loadBackupStatus = () => {
    fetch('/api/settings/backup').then(r => r.json()).then(data => {
      if (data && !data.error) setBackupStatus(data);
    }).catch(() => {});
  };

  // 后端返回的是本地时间字符串（YYYY-MM-DD HH:MM:SS），不能直接交给 new Date()
  const formatLocal = (s: string | null | undefined) => {
    if (!s) return '-';
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return s;
    return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  };

  const toggleAutoBackup = async (enabled: boolean) => {
    setSavingAutoBackup(true);
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { auto_backup_enabled: enabled ? 'true' : 'false' } }),
    });
    setSavingAutoBackup(false);
    if (res.ok) {
      setSettings(prev => ({ ...prev, auto_backup_enabled: enabled ? 'true' : 'false' }));
      setBackupMsg(enabled ? '已开启自动备份（每天首次登录时执行一次）' : '已关闭自动备份');
      loadBackupStatus();
    } else {
      setBackupMsg('设置保存失败');
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setUploadMsg('请选择图片文件');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadMsg('文件不能超过 10MB');
      return;
    }
    setAvatarFile(f);
  };

  const handleCropDone = async (croppedFile: File) => {
    setAvatarFile(null);
    setUploading(true);
    setUploadMsg('正在上传...');
    try {
      const form = new FormData();
      form.append('avatar', croppedFile);
      const res = await fetch('/api/auth/avatar', { method: 'PUT', body: form });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || '上传失败');
      }
      const data = await res.json();
      setAvatarPreview(`/api/uploads/${data.avatar_path}?t=${Date.now()}`);
      setUploadMsg('头像更新成功');
      // Force sidebar to refresh user info
      window.location.reload();
    } catch (err) {
      setUploadMsg((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <p className="text-[13px] text-gray-500 text-center py-20">加载中...</p>;

  return (
    <div className="animate-fade-up">
      <h1 className="text-[22px] font-bold text-gray-800 mb-6">系统设置</h1>

      <div className="space-y-5">
        {/* Avatar / Profile Section */}
        <div className="glass-card p-5">
          <h3 className="text-[14px] font-semibold text-gray-700 mb-4">个人信息</h3>
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-2xl font-bold text-emerald-600 overflow-hidden border-2 border-black/5">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="头像" className="w-full h-full object-cover" />
                ) : user?.avatar_path ? (
                  <img src={`/api/uploads/${user.avatar_path}`} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  (user?.display_name || user?.username || '?').charAt(0)
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-gray-800">{user?.display_name || user?.username || '用户'}</p>
              <p className="text-[13px] text-gray-500">@{user?.username} · {user?.role === 'super_admin' ? '超级管理员' : user?.role}</p>
              <div className="flex items-center gap-2 mt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium glass-page-card text-gray-600 hover:bg-black/5 transition-colors disabled:opacity-50"
                >
                  {uploading ? '上传中...' : '更换头像'}
                </button>
                {uploadMsg && <span className={`text-[12px] ${uploadMsg.includes('成功') ? 'text-emerald-600' : 'text-gray-500'}`}>{uploadMsg}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Stats card */}
        <div className="glass-card p-5">
          <h3 className="text-[14px] font-semibold text-gray-700 mb-4">系统状态</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 glass-page-card rounded-xl">
              <div className="text-[20px] font-bold text-emerald-600">{stats.totalIPs}</div>
              <div className="text-[11px] text-gray-500">活跃 IP</div>
            </div>
            <div className="text-center p-3 glass-page-card rounded-xl">
              <div className="text-[20px] font-bold text-cyan-400">{stats.totalMaterials}</div>
              <div className="text-[11px] text-gray-500">素材总数</div>
            </div>
            <div className="text-center p-3 glass-page-card rounded-xl">
              <div className="text-[20px] font-bold text-emerald-600">{stats.totalUsers}</div>
              <div className="text-[11px] text-gray-500">用户数</div>
            </div>
            <div className="text-center p-3 glass-page-card rounded-xl">
              <div className="text-[20px] font-bold text-gray-600">{stats.dbSizeMB} MB</div>
              <div className="text-[11px] text-gray-500">数据库大小</div>
            </div>
          </div>
        </div>

        {/* Settings form */}
        <form onSubmit={handleSave} className="glass-card p-5">
          <h3 className="text-[14px] font-semibold text-gray-700 mb-4">存储设置</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">单个文件最大上传 (MB)</label>
              <input type="number" value={settings.upload_max_size_mb || '500'}
                onChange={e => setSettings({ ...settings, upload_max_size_mb: e.target.value })}
                className="input-glass w-40" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">回收站保留天数</label>
              <input type="number" value={settings.recycle_retention_days || '30'}
                onChange={e => setSettings({ ...settings, recycle_retention_days: e.target.value })}
                className="input-glass w-40" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">会话超时 (分钟)</label>
              <input type="number" value={settings.session_timeout_minutes || '1440'}
                onChange={e => setSettings({ ...settings, session_timeout_minutes: e.target.value })}
                className="input-glass w-40" />
            </div>
          </div>
          <div className="mt-4">
            <Button type="submit" size="sm" disabled={saving}>{saving ? '保存中...' : '保存设置'}</Button>
          </div>
        </form>

        {/* Feishu Integration */}
        <div className="glass-card p-5">
          <h3 className="text-[14px] font-semibold text-gray-700 mb-4">飞书集成</h3>
          <p className="text-[13px] text-gray-500 mb-4">
            配置飞书自建应用的凭证，用于将任务完成记录同步到飞书文档。
            <a href="https://open.feishu.cn/app" target="_blank" rel="noopener noreferrer"
               className="text-blue-500 hover:underline ml-1">去飞书开放平台</a>
          </p>

          {/* OAuth Authorization */}
          <div className="p-4 rounded-xl border border-black/5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[13px] font-semibold text-gray-700">飞书账号授权</h4>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  授权后才能将文档直接创建到知识库中。只需授权一次。
                </p>
              </div>
              {feishuAuthStatus?.authorized ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium bg-emerald-50 text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    已授权
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/settings/feishu-disconnect', { method: 'POST' });
                      setFeishuAuthStatus({ authorized: false, expiresAt: null });
                      setFeishuAuthMsg({ type: 'success', text: '已取消飞书授权' });
                    }}
                    className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                  >
                    取消授权
                  </button>
                </div>
              ) : (
                <a
                  href="/api/feishu/oauth/authorize"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  授权飞书
                </a>
              )}
            </div>
            {feishuAuthStatus?.authorized && feishuAuthStatus.expiresAt && (
              <p className="text-[11px] text-gray-400 mt-2">
                凭证到期时间：{new Date(feishuAuthStatus.expiresAt).toLocaleString('zh-CN')}
              </p>
            )}
            {/* 未授权/已失效时明确说明原因，避免"看着是好的、实际全失败" */}
            {feishuAuthStatus && !feishuAuthStatus.authorized && feishuAuthStatus.message && (
              <p className={`text-[11px] mt-2 ${feishuAuthStatus.state === 'unreachable' ? 'text-amber-600' : 'text-red-500'}`}>
                {feishuAuthStatus.message}
                {feishuAuthStatus.needsReauth && ' 请点击右上角「授权飞书」重新授权。'}
              </p>
            )}
            {feishuAuthMsg && (
              <p className={`text-[12px] mt-2 ${feishuAuthMsg.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                {feishuAuthMsg.text}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">App ID</label>
              <input type="text" value={settings.feishu_app_id || ''}
                onChange={e => setSettings({ ...settings, feishu_app_id: e.target.value })}
                className="input-glass w-80" placeholder="cli_xxxxxxxxxxxxxxxx" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">App Secret</label>
              <input type="password" value={settings.feishu_app_secret || ''}
                onChange={e => setSettings({ ...settings, feishu_app_secret: e.target.value })}
                className="input-glass w-80" placeholder="输入 App Secret" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">知识库 Node Token</label>
              <input type="text" value={settings.feishu_folder_token || ''}
                onChange={e => setSettings({ ...settings, feishu_folder_token: e.target.value })}
                className="input-glass w-80" placeholder="知识库节点 token" />
              <p className="text-[11px] text-gray-400 mt-1">
                填写知识库的 node token，新建的文档将直接创建到知识库中。需要先完成飞书授权。
              </p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            确保飞书应用已开启权限：docx:document、docx:document:readonly、wiki:wiki、drive:drive
          </p>
        </div>

        {/* Backup */}
        <div className="glass-card p-5">
          <h3 className="text-[14px] font-semibold text-gray-700 mb-4">备份</h3>

          <div className="flex items-center justify-between p-4 rounded-xl border border-black/5 mb-4">
            <div>
              <h4 className="text-[13px] font-semibold text-gray-700">自动备份</h4>
              <p className="text-[12px] text-gray-500 mt-0.5">
                开启后每天首次有人登录时自动备份一次数据库，保留最近 {backupStatus?.retentionDays ?? 30} 天。
                <br />
                备份文件保存在 <code className="text-[11px]">data/backups/</code>。
              </p>
            </div>
            <button
              type="button"
              disabled={savingAutoBackup}
              onClick={() => toggleAutoBackup(!(backupStatus?.enabled ?? settings.auto_backup_enabled === 'true'))}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                (backupStatus?.enabled ?? settings.auto_backup_enabled === 'true') ? 'bg-emerald-500' : 'bg-gray-300'
              } ${savingAutoBackup ? 'opacity-60' : ''}`}
              title={(backupStatus?.enabled ?? false) ? '点击关闭自动备份' : '点击开启自动备份'}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                (backupStatus?.enabled ?? settings.auto_backup_enabled === 'true') ? 'left-6' : 'left-0.5'
              }`} />
            </button>
          </div>

          <p className="text-[13px] text-gray-500 mb-3">
            数据库文件位于 <code className="text-[12px]">data/app.db</code>
            {backupStatus && `（当前 ${(backupStatus.dbSizeBytes / 1024 / 1024).toFixed(1)} MB）`}。
            {backupStatus?.lastBackupAt && (
              <> 上次备份：{formatLocal(backupStatus.lastBackupAt)}。</>
            )}
            {!backupStatus?.lastBackupAt && ' 还没有任何备份。'}
          </p>

          <div className="flex gap-3 items-center">
            <Button size="sm" variant="secondary" onClick={handleBackup}>立即备份</Button>
            {backupMsg && <span className="text-[13px] text-gray-500">{backupMsg}</span>}
          </div>

          {backupStatus && backupStatus.backups.length > 0 && (
            <div className="mt-4 rounded-xl border border-black/5 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="glass-page-card">
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">备份文件</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">时间</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">大小</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {backupStatus.backups.slice(0, 8).map(b => (
                    <tr key={b.fileName}>
                      <td className="px-3 py-2 text-[12px] text-gray-600 font-mono">{b.fileName}</td>
                      <td className="px-3 py-2 text-[12px] text-gray-500">{formatLocal(b.createdAt)}</td>
                      <td className="px-3 py-2 text-[12px] text-gray-500 text-right">{(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {backupStatus.backups.length > 8 && (
                <p className="px-3 py-2 text-[11px] text-gray-400">
                  共 {backupStatus.backups.length} 份，仅显示最近 8 份。
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image Cropper Modal */}
      {avatarFile && (
        <ImageCropper
          file={avatarFile}
          onCrop={handleCropDone}
          onCancel={() => setAvatarFile(null)}
        />
      )}
    </div>
  );
}
