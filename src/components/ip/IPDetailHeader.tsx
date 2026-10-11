'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Props {
  ip: { id: number; name: string; category: string; tags: string; description: string; avatar_path: string | null; status: string; };
  canEdit: boolean;
  canDelete: boolean;
}

export default function IPDetailHeader({ ip, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [returnUrl, setReturnUrl] = useState('');
  const tags = ip.tags ? ip.tags.split(',').filter(Boolean) : [];

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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/ips/${ip.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      router.push('/ips'); router.refresh();
    } catch { setDeleting(false); setShowDelete(false); }
  };

  return (
    <div className="glass-elevated rounded-[20px] p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-5">
          <div className="avatar-cosmic-ring inline-flex flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/20 overflow-hidden flex-shrink-0 border border-black/10">
              {ip.avatar_path ? (
                <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-emerald-600 text-[32px] font-bold bg-gradient-to-br from-emerald-500/20 to-cyan-500/20">{ip.name.charAt(0)}</div>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-heading-xl text-gray-800">{ip.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              {ip.category && <Badge color="blue">{ip.category}</Badge>}
              <Badge color={ip.status === 'active' ? 'green' : ip.status === 'paused' ? 'yellow' : 'gray'}>{ip.status === 'active' ? '合作中' : ip.status === 'paused' ? '暂停合作' : '已结束'}</Badge>
            </div>
            {tags.length > 0 && <div className="flex gap-1 mt-2 flex-wrap">{tags.map(t => <Badge key={t} variant="outline">{t.trim()}</Badge>)}</div>}
            {ip.description && <p className="mt-3 text-[14px] text-gray-500 max-w-xl leading-relaxed">{ip.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <Link href={`/ips/${ip.id}/edit${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`}><Button variant="secondary" size="sm">编辑</Button></Link>}
          {canDelete && <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>删除</Button>}
        </div>
      </div>
      <ConfirmDialog open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete}
        title="删除 IP" message={`确定要删除「${ip.name}」吗？所有相关数据都会被删除。`} loading={deleting} />
    </div>
  );
}
