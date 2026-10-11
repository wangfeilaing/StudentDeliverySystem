import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canPerform } from '@/lib/permissions';
import { notFound } from 'next/navigation';
import IPDetailHeader from '@/components/ip/IPDetailHeader';
import IPStatsBar from '@/components/ip/IPStatsBar';
import IPTabsContent from '@/components/ip/IPTabsContent';

export default async function IPDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ipId = parseInt(id, 10);
  if (isNaN(ipId)) notFound();

  const db = getDb();
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';
  const userCanEdit = canPerform(currentUser?.role, 'ip:edit');
  const userCanDelete = canPerform(currentUser?.role, 'ip:delete');
  const ip = db.prepare(`
    SELECT ip.*,
      (SELECT COUNT(*) FROM social_account WHERE ip_id = ip.id) as account_count,
      (SELECT COUNT(*) FROM screenshot WHERE ip_id = ip.id AND deleted_at IS NULL) as screenshot_count,
      (SELECT COUNT(*) FROM video WHERE ip_id = ip.id AND deleted_at IS NULL) as video_count,
      (SELECT COUNT(*) FROM feedbacks WHERE ip_id = ip.id) as feedback_count,
      (SELECT COUNT(*) FROM success_cases WHERE ip_id = ip.id) as case_count
    FROM ip WHERE id = ? AND deleted_at IS NULL
  `).get(ipId) as Record<string, unknown> | undefined;
  if (!ip) notFound();

  const accounts = db.prepare("SELECT * FROM social_account WHERE ip_id = ? ORDER BY created_at DESC").all(ipId) as Array<Record<string, unknown>>;
  const screenshots = db.prepare("SELECT * FROM screenshot WHERE ip_id = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(ipId) as Array<Record<string, unknown>>;
  const videos = db.prepare("SELECT * FROM video WHERE ip_id = ? AND deleted_at IS NULL ORDER BY created_at DESC").all(ipId) as Array<Record<string, unknown>>;
  const feedbacks = db.prepare("SELECT * FROM feedbacks WHERE ip_id = ? ORDER BY created_at DESC").all(ipId) as Array<Record<string, unknown>>;
  const cases = db.prepare("SELECT * FROM success_cases WHERE ip_id = ? ORDER BY created_at DESC").all(ipId) as Array<Record<string, unknown>>;

  const taskCount = (db.prepare(
    "SELECT COUNT(*) as c FROM client_delivery_tasks WHERE client_id = ?"
  ).get(ipId) as { c: number }).c;

  const tabs = [
    { key: 'resume', label: '学员简历' },
    { key: 'accounts', label: '平台账号', count: ip.account_count as number },
    { key: 'delivery', label: '交付进度', count: taskCount },
    { key: 'materials', label: '素材库', count: (ip.screenshot_count as number) + (ip.video_count as number) },
    { key: 'cooperation', label: '合作资料' },
    { key: 'logs', label: '操作记录' },
  ];

  return (
    <div className="animate-fade-up">
      <IPDetailHeader ip={{
        id: ip.id as number, name: ip.name as string, category: ip.category as string,
        tags: ip.tags as string, description: ip.description as string,
        avatar_path: ip.avatar_path as string | null, status: ip.status as string,
      }} canEdit={userCanEdit} canDelete={userCanDelete} />

      <div className="mt-6 mb-6">
        <IPStatsBar
          accountCount={ip.account_count as number}
          screenshotCount={ip.screenshot_count as number}
          videoCount={ip.video_count as number}
        />
      </div>

      <IPTabsContent
        ipId={ipId}
        ipName={(ip.name as string) || ''}
        ipCategory={(ip.category as string) || ''}
        ipTags={(ip.tags as string) || ''}
        ipStatus={(ip.status as string) || 'active'}
        ipAvatarPath={(ip.avatar_path as string) || null}
        description={(ip.description as string) || null}
        ipInfo={{
          real_name: (ip.real_name as string) || '',
          nickname: (ip.nickname as string) || '',
          gender: (ip.gender as string) || '',
          birthday: (ip.birthday as string) || '',
          phone: (ip.phone as string) || '',
          wechat: (ip.wechat as string) || '',
          email: (ip.email as string) || '',
          location: (ip.location as string) || '',
          cooperation_type: (ip.cooperation_type as string) || '',
          cooperation_start_date: (ip.cooperation_start_date as string) || '',
          cooperation_end_date: (ip.cooperation_end_date as string) || '',
          id_card: (ip.id_card as string) || '',
          bank_account: (ip.bank_account as string) || '',
          bank_address: (ip.bank_address as string) || '',
          contract_no: (ip.contract_no as string) || '',
          emergency_contact: (ip.emergency_contact as string) || '',
          sensitive_notes: (ip.sensitive_notes as string) || '',
        }}
        isAdmin={isAdmin}
        accounts={accounts.map(a => ({
          id: a.id as number, platform: a.platform as string,
          account_name: a.account_name as string, account_url: a.account_url as string,
          follower_count: a.follower_count as number, notes: a.notes as string,
        }))}
        screenshots={screenshots.map(s => ({
          id: s.id as number, title: s.title as string, category: s.category as string,
          file_path: s.file_path as string, file_size: s.file_size as number,
          created_at: s.created_at as string,
        }))}
        videos={videos.map(v => ({
          id: v.id as number, title: v.title as string, category: v.category as string,
          file_path: v.file_path as string, file_size: v.file_size as number,
          created_at: v.created_at as string,
        }))}
        feedbacks={feedbacks.map(f => ({
          id: f.id as number, ip_id: f.ip_id as number, source: f.source as string,
          rating: f.rating as number, content: f.content as string,
          reviewer_name: f.reviewer_name as string, related_project: f.related_project as string,
          screenshot_ids: f.screenshot_ids as string, created_at: f.created_at as string,
        }))}
        cases={cases.map(c => ({
          id: c.id as number, title: c.title as string, platform: c.platform as string,
          video_url: c.video_url as string, publish_date: c.publish_date as string,
          play_count: c.play_count as number, like_count: c.like_count as number,
          comment_count: c.comment_count as number, favorite_count: c.favorite_count as number,
          share_count: c.share_count as number, conversion_result: c.conversion_result as string,
          notes: c.notes as string, created_at: c.created_at as string,
        }))}
        tabs={tabs}
        productTypeId={(ip.product_type_id as number) || null}
        courseStartDate={(ip.course_start_date as string) || (ip.cooperation_start_date as string) || ''}
        batchNumber={(ip.batch_number as string) || ''}
        stats={{
          accountCount: ip.account_count as number,
          screenshotCount: ip.screenshot_count as number,
          videoCount: ip.video_count as number,
          feedbackCount: ip.feedback_count as number,
          caseCount: ip.case_count as number,
          taskCount,
        }}
      />
    </div>
  );
}
