'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import ImageLightbox from '@/components/ui/ImageLightbox';
import VideoPlayer from '@/components/ui/VideoPlayer';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DeliveryCalendar from '@/components/ip/DeliveryCalendar';

interface IPDetail {
  id: number; name: string; category: string; tags: string; description: string;
  avatar_path: string | null; status: string; real_name: string; location: string;
  cooperation_type: string; cooperation_start_date: string; cooperation_end_date: string;
  product_type_id: number | null; course_start_date: string; batch_number: string; updated_at: string;
}
interface Account { id: number; platform: string; account_name: string; follower_count: number; account_url: string; notes: string; updated_at: string; }
interface Screenshot { id: number; title: string; file_path: string; category: string; created_at: string; }
interface Video { id: number; title: string; file_path: string; duration: number | null; category: string; created_at: string; }
interface SuccessCase { id: number; title: string; platform: string; publish_date: string; play_count: number; like_count: number; comment_count: number; }
interface Feedback { id: number; source: string; content: string; rating: number; created_at: string; }

interface Props { ipId: number; }

function SectionHeading({ title, icon, badge }: { title: string; icon: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-8 first:mt-4 pb-2.5 border-b border-black/5">
      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={icon} />
      </svg>
      <h3 className="text-[14px] font-semibold text-gray-700">{title}</h3>
      {badge && <span className="text-[11px] text-gray-500">({badge})</span>}
    </div>
  );
}

export default function IPDetailPanel({ ipId }: Props) {
  const [ip, setIp] = useState<IPDetail | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matFilter, setMatFilter] = useState('all');

  // Inline upload state
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(0);
  const [uploadError, setUploadError] = useState('');

  // Lightbox preview state
  const [previewItem, setPreviewItem] = useState<{ src: string; title: string } | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ src: string; title: string } | null>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; type: 'screenshot' | 'video'; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [returnUrl, setReturnUrl] = useState('');

  useEffect(() => {
    if (typeof document !== 'undefined' && document.referrer) {
      try {
        const u = new URL(document.referrer);
        if (u.pathname.startsWith('/ips') && u.pathname !== window.location.pathname) {
          setReturnUrl(u.pathname + u.search);
        }
      } catch {}
    }
    if (!returnUrl) setReturnUrl('/ips');
  }, []);

  const toggleSelect = (key: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const downloadSelected = async () => {
    const selected = filteredMaterials.filter(m => selectedIds.has(`${m.type}-${m.id}`));
    for (const m of selected) {
      try {
        const res = await fetch(`/api/uploads/${(m as Screenshot).file_path}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = m.title || (m.type === 'video' ? 'video.mp4' : 'screenshot.png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Small delay to avoid browser blocking multiple downloads
        await new Promise(r => setTimeout(r, 300));
        URL.revokeObjectURL(url);
      } catch {
        // skip failed downloads
      }
    }
    setSelectedIds(new Set());
  };

  const downloadSingle = async (m: { type: string; id: number; title?: string; file_path: string }) => {
    try {
      const res = await fetch(`/api/uploads/${m.file_path}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m.title || (m.type === 'video' ? 'video.mp4' : 'screenshot.png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // skip failed
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const url = deleteTarget.type === 'screenshot'
        ? `/api/screenshots/${deleteTarget.id}`
        : `/api/videos/${deleteTarget.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      refreshMaterials();
    } catch {
      // ignore
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/ips/${ipId}`).then(r => r.json()),
      fetch(`/api/ips/${ipId}/accounts`).then(r => r.json()),
      fetch(`/api/ips/${ipId}/screenshots`).then(r => r.json()),
      fetch(`/api/ips/${ipId}/videos`).then(r => r.json()),
      fetch(`/api/ips/${ipId}/delivery-tasks`).then(r => r.json()),
    ]).then(([ipData, accData, ssData, vdData, tData]) => {
      setIp(ipData);
      setAccounts(Array.isArray(accData) ? accData : []);
      setScreenshots(Array.isArray(ssData) ? ssData : (ssData.items || []));
      setVideos(Array.isArray(vdData) ? vdData : (vdData.items || []));
      const tasks = Array.isArray(tData) ? tData : [];
      setTaskCount(tasks.length);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [ipId]);

  const refreshMaterials = () => {
    Promise.all([
      fetch(`/api/ips/${ipId}/screenshots`).then(r => r.json()),
      fetch(`/api/ips/${ipId}/videos`).then(r => r.json()),
    ]).then(([ssData, vdData]) => {
      setScreenshots(Array.isArray(ssData) ? ssData : (ssData.items || []));
      setVideos(Array.isArray(vdData) ? vdData : (vdData.items || []));
    }).catch(() => {});
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError('');
    let done = 0;
    const total = files.length;

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name);
        formData.append('category', uploadCategory);
        const isVideo = file.type.startsWith('video/');
        const url = isVideo
          ? `/api/ips/${ipId}/videos`
          : `/api/ips/${ipId}/screenshots`;
        const res = await fetch(url, { method: 'POST', body: formData });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || '上传失败');
        }
        done++;
        setUploadDone(done);
      } catch (err) {
        setUploadError(`${file.name}: ${(err as Error).message}`);
        break;
      }
    }

    setUploading(false);
    e.target.value = '';
    if (done > 0) {
      setUploadDone(0);
      refreshMaterials();
    }
  };

  const categoryOptions = [
    { value: '', label: '选择分类（可选）' },
    { value: '好评截图', label: '好评截图' },
    { value: '合影', label: '合影' },
    { value: '爆款截图', label: '爆款截图' },
    { value: '视频爆款', label: '视频爆款' },
    { value: 'MP4视频', label: 'MP4视频' },
    { value: '其他', label: '其他' },
  ];

  const allMaterials = [
    ...screenshots.map(s => ({ ...s, type: 'screenshot' as const })),
    ...videos.map(v => ({ ...v, type: 'video' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const filteredMaterials = allMaterials.filter(m => {
    if (matFilter !== 'all' && m.type !== matFilter) return false;
    return true;
  });

  const totalFollowers = accounts.reduce((s, a) => s + a.follower_count, 0);
  const completeness = ip ? (
    (ip.real_name ? 20 : 0) + (ip.location ? 15 : 0) + (ip.cooperation_type ? 15 : 0) +
    (ip.category ? 10 : 0) + (accounts.length > 0 ? 20 : 0) + (allMaterials.length > 0 ? 20 : 0)
  ) : 0;

  const platformLogo = (platform: string) => {
    const w = 20, h = 20;
    switch (platform) {
      case '抖音':
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#111"/>
            <path d="M17.5 8.5a4.8 4.8 0 01-3-1.2v5.3c0 3-2.5 5.4-5.5 5.4s-5.5-2.4-5.5-5.4 2.5-5.4 5.5-5.4c.3 0 .5 0 .8.1v3c-.3-.1-.5-.1-.8-.1-1.4 0-2.5 1.1-2.5 2.4s1.1 2.4 2.5 2.4 2.5-1.1 2.5-2.4V2.5h3c0 3.3 2.7 6 6 6v3l-3-.1z" fill="#00f2ea" stroke="#00f2ea" strokeWidth="0.3"/>
          </svg>
        );
      case '小红书':
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="#FF2442"/>
            <path d="M12 5c-2.5 0-4.5 1.5-5 3.5.8-.5 1.8-.8 2.8-.6.8.1 1.5.6 2 1.2 1 1.2 1.8 2.9 1.8 4.9 0 .8-.2 1.5-.5 2 .3-.1.5-.3.7-.5 1-1.2 1.7-2.8 1.7-4.5 0-1.5-.5-2.8-1.3-3.8-.6-.7-1.4-1.2-2.2-1.2z" fill="white"/>
            <circle cx="8.5" cy="14.5" r="1.2" fill="white"/>
            <circle cx="12" cy="17.5" r="1" fill="white"/>
            <circle cx="15.5" cy="14" r="0.8" fill="white"/>
          </svg>
        );
      case '视频号':
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#07C160"/>
            <polygon points="9.5,6.5 9.5,17.5 18,12" fill="white"/>
          </svg>
        );
      case 'B站':
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#FB7299"/>
            <path d="M7 8h10a1 1 0 011 1v6a1 1 0 01-1 1H7a1 1 0 01-1-1V9a1 1 0 011-1z" fill="white" opacity="0.9"/>
            <path d="M5 10l2-2M19 10l-2-2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
            <circle cx="8.5" cy="10" r="0.6" fill="#FB7299"/>
            <circle cx="15.5" cy="10" r="0.6" fill="#FB7299"/>
          </svg>
        );
      case '公众号':
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#07C160"/>
            <path d="M6 7h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1V8a1 1 0 011-1z" fill="white" opacity="0.3"/>
            <path d="M7 9h4M7 11h6M7 13h5M7 15h3" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        );
      case '快手':
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#FF4906"/>
            <rect x="7" y="7" width="10" height="10" rx="1.5" fill="white" opacity="0.9"/>
            <polygon points="10.5,9.5 10.5,14.5 14.5,12" fill="#FF4906"/>
          </svg>
        );
      case '微博':
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#E6162D"/>
            <path d="M12 6c-2.5 0-4.5 1.5-5 3.5 0 0 1.5-.5 3 0 1 .3 1.8 1 2.2 2 0 0 .5 1.5-.5 2.5M12 16c3 0 5.5-2 5.5-4.5S15 7 12 7c-2 0-3.5 1-4 2" stroke="white" strokeWidth="1.2" fill="none"/>
            <circle cx="14" cy="12" r="1.8" fill="white"/>
            <circle cx="10.5" cy="16" r="0.8" fill="white"/>
          </svg>
        );
      default:
        return (
          <svg width={w} height={h} viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#6366f1"/>
            <circle cx="12" cy="12" r="3" fill="white" opacity="0.7"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          </svg>
        );
    }
  };

  const formatNum = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500 text-[13px]">加载中...</div>
      </div>
    );
  }

  if (!ip) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500 text-[13px]">IP 数据加载失败</div>
      </div>
    );
  }

  const statusInfo: Record<string, { label: string; cls: string }> = {
    active: { label: '活跃中', cls: 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/20' },
    paused: { label: '停更', cls: 'bg-amber-500/15 text-amber-400 border border-amber-400/20' },
    ended: { label: '已结束', cls: 'bg-slate-500/15 text-gray-500 border border-slate-400/20' },
    inactive: { label: '待维护', cls: 'bg-orange-500/15 text-orange-400 border border-orange-400/20' },
  };
  const status = statusInfo[ip.status] || statusInfo.active;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* IP Profile Header */}
      <div className="px-6 pt-5 pb-4 border-b border-black/5">
        <div className="flex items-start gap-5">
          <div className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-emerald-100 to-cyan-100 flex items-center justify-center text-2xl font-bold text-emerald-600 flex-shrink-0 overflow-hidden border-2 border-black/10 shadow-sm">
            {ip.avatar_path ? (
              <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-full h-full object-cover" />
            ) : (
              ip.name.charAt(0)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-bold text-gray-800">{ip.name}</h2>
              <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${status.cls}`}>{status.label}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {ip.category && <span className="text-[12px] text-gray-500">{ip.category}</span>}
              {ip.real_name && <span className="text-[12px] text-gray-500">· {ip.real_name}</span>}
              {ip.location && <span className="text-[12px] text-gray-500">· {ip.location}</span>}
            </div>
            {ip.description && <p className="text-[13px] text-gray-500 mt-1.5 line-clamp-2">{ip.description}</p>}
            {ip.tags && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {ip.tags.split(',').filter(Boolean).map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 font-medium">{t.trim()}</span>
                ))}
              </div>
            )}
          </div>
          {/* Stats */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {[
              { label: '绑定账号', value: accounts.length },
              { label: '粉丝总数', value: formatNum(totalFollowers) },
              { label: '素材总数', value: allMaterials.length },
              { label: '交付任务', value: taskCount },
            ].map((s, i) => (
              <div key={i} className="text-center px-3">
                <div className="text-[15px] font-bold text-gray-800">{s.value}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
            <Link href={`/ips/${ip.id}/edit${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`} className="px-3.5 py-2 rounded-xl text-[12px] font-medium bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:opacity-90 shadow-sm transition-all flex-shrink-0">
              编辑资料
            </Link>
          </div>
        </div>
      </div>

      {/* All content in a single scrollable view */}
      <div className="px-6 py-4 space-y-6">

        {/* ===== 学员简历 ===== */}
        <SectionHeading title="学员简历" icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        <div className="space-y-4">
          {/* Bio card */}
          {ip.description && (
            <div className="glass-card p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-white">
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">个人简介 / 简历</h4>
              <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">{ip.description}</p>
            </div>
          )}
          {/* 合作概况 — full width */}
          <div className="glass-card p-4 rounded-2xl">
            <h4 className="text-[12px] font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              合作概况
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 flex-shrink-0">合作类型</span>
                <span className="text-gray-700">{ip.cooperation_type || '未设置'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 flex-shrink-0">开始时间</span>
                <span className="text-gray-700">{ip.cooperation_start_date || '未设置'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 flex-shrink-0">结束时间</span>
                <span className="text-gray-700">{ip.cooperation_end_date || '至今'}</span>
              </div>
              <div className="flex items-center gap-2 sm:col-span-3">
                <span className="text-gray-400 flex-shrink-0">资料完整度</span>
                <span className="text-emerald-700 font-semibold">{completeness}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== PLATFORM ACCOUNTS ===== */}
        <SectionHeading title="平台账号" icon="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" badge={String(accounts.length)} />
        {accounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-[13px]">暂无绑定账号，请先编辑 IP 添加账号</p>
            <Link href={`/ips/${ip.id}/edit${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`} className="inline-block mt-3 text-[13px] text-emerald-300 font-medium">去编辑 →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map(a => (
              <div key={a.id} className="glass-card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center">{platformLogo(a.platform)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-gray-800">{a.platform}</span>
                    <span className="text-[12px] text-gray-500">{a.account_name}</span>
                  </div>
                  {a.account_url ? (
                    <a href={a.account_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-300 hover:text-emerald-200 truncate mt-0.5 inline-flex items-center gap-1 transition-colors">
                      {a.account_url.length > 50 ? a.account_url.slice(0, 50) + '...' : a.account_url}
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <div className="text-[11px] text-gray-600 mt-0.5">未设置链接</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-bold text-gray-800">{formatNum(a.follower_count)}</div>
                  <div className="text-[10px] text-gray-500">粉丝</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 border border-emerald-400/20 font-medium">正常</span>
              </div>
            ))}
          </div>
        )}

        {/* ===== 交付进度 (Calendar) ===== */}
        <SectionHeading title="交付进度" icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" badge={String(taskCount)} />
        <div className="mb-4">
          <DeliveryCalendar
            ipId={ipId}
            productTypeId={ip?.product_type_id || null}
            courseStartDate={ip?.course_start_date || ip?.cooperation_start_date || ''}
            batchNumber={ip?.batch_number || ''}
          />
        </div>

        {/* ===== MATERIALS ===== */}
        <SectionHeading title="素材库" icon="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" badge={String(allMaterials.length)} />
        <div>
          {/* Inline upload area */}
          <div className="mb-4 p-4 glass-page-card border border-dashed border-emerald-400/15 rounded-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-gray-600 flex-shrink-0">上传素材</div>
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value)}
                className="text-[12px] rounded-lg border border-black/5 glass-page-card px-2.5 py-1.5 text-gray-600 focus:outline-none focus:border-emerald-400/30"
              >
                {categoryOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileSelect}
                disabled={uploading}
                className="text-[12px] text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[12px] file:font-medium file:bg-emerald-500/15 file:text-emerald-300 hover:file:bg-emerald-500/25 file:cursor-pointer file:transition-colors"
              />
              {uploading && (
                <span className="text-[12px] text-emerald-300 font-medium">
                  上传中... {uploadDone} 完成
                </span>
              )}
            </div>
            {uploadError && (
              <div className="mt-2 text-[12px] text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg">{uploadError}</div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {[
              { key: 'all', label: '全部' }, { key: 'screenshot', label: '截图' }, { key: 'video', label: '视频' },
            ].map(f => (
              <button key={f.key} onClick={() => setMatFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  matFilter === f.key ? 'bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.1)] border border-emerald-400/15' : 'glass-page-card text-gray-500 hover:bg-black/5'
                }`}
              >{f.label}</button>
            ))}
            <span className="text-[11px] text-gray-500 ml-auto">{filteredMaterials.length} 个素材</span>
          </div>
          {filteredMaterials.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-[13px]">暂无素材</p>
            </div>
          ) : (
            <>
              {/* Batch action bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-emerald-500/10 border border-emerald-400/20 rounded-xl">
                  <span className="text-[12px] font-medium text-emerald-300">已选 {selectedIds.size} 项</span>
                  <button
                    onClick={downloadSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    下载选中
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[11px] text-gray-500 hover:text-gray-700 transition-colors ml-auto"
                  >
                    取消选择
                  </button>
                </div>
              )}
              <div className="grid grid-cols-6 gap-2">
                {filteredMaterials.map(m => {
                  const key = `${m.type}-${m.id}`;
                  const isSel = selectedIds.has(key);
                  return (
                    <div
                      key={key}
                      className={`glass-card overflow-hidden group cursor-pointer transition-all relative ${
                        isSel ? 'ring-2 ring-emerald-500 shadow-md' : 'hover:shadow-md'
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={e => { e.stopPropagation(); toggleSelect(key); }}
                        className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          isSel ? 'bg-emerald-500 border-emerald-500' : 'border-black/10 bg-black/30 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {isSel && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div
                        onClick={() => {
                          if (m.type === 'screenshot') {
                            setPreviewItem({ src: `/api/uploads/${(m as Screenshot).file_path}`, title: m.title || '截图' });
                          } else if (m.type === 'video') {
                            setPreviewVideo({ src: `/api/uploads/${(m as Video).file_path}`, title: m.title || '视频' });
                          }
                        }}
                      >
                        <div className="aspect-square glass-page-card flex items-center justify-center overflow-hidden">
                          {m.type === 'screenshot' ? (
                            <img src={`/api/uploads/${(m as Screenshot).file_path}`} alt={m.title || '截图'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                          ) : (
                            <div className="w-full h-full relative bg-black">
                              <video
                                src={`/api/uploads/${(m as Video).file_path}`}
                                preload="metadata"
                                muted
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <svg className="w-6 h-6 text-white/80 drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <div className="text-[11px] font-medium text-gray-700 truncate">{m.title || '未命名'}</div>
                          <div className="flex items-center justify-between mt-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] px-1.5 py-0.5 rounded glass-page-card text-gray-500">{m.type === 'screenshot' ? '截图' : '视频'}</span>
                              <span className="text-[9px] text-gray-500">{m.created_at?.slice(0, 10)}</span>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={e => { e.stopPropagation(); downloadSingle({ id: m.id, type: m.type, title: m.title, file_path: (m as Screenshot).file_path }); }}
                                className="w-5 h-5 rounded-md bg-black/[0.04] hover:bg-emerald-500/20 flex items-center justify-center transition-colors"
                                title="下载"
                              >
                                <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteTarget({ id: m.id, type: m.type as 'screenshot' | 'video', title: m.title || '未命名' }); }}
                                className="w-5 h-5 rounded-md bg-black/[0.04] hover:bg-red-500/20 flex items-center justify-center transition-colors"
                                title="删除"
                              >
                                <svg className="w-3 h-3 text-gray-600 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>

      {/* Lightbox preview with editor */}
      {previewItem && (
        <ImageLightbox
          src={previewItem.src}
          title={previewItem.title}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* Video player */}
      {previewVideo && (
        <VideoPlayer
          src={previewVideo.src}
          title={previewVideo.title}
          onClose={() => setPreviewVideo(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除素材"
        message={`确定要删除「${deleteTarget?.title || ''}」吗？删除后可在回收站恢复。`}
        confirmLabel="删除"
        loading={deleting}
      />
    </div>
  );
}
