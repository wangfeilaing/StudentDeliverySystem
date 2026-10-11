import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM success_cases WHERE id = ?").get(id);
    if (!existing) return errorResponse('案例不存在', 404);

    const data = await request.json();
    const { title, platform, video_url, publish_date, play_count, like_count, comment_count, favorite_count, share_count, conversion_result, screenshot_ids, notes } = data;

    db.prepare(`
      UPDATE success_cases SET title=?, platform=?, video_url=?, publish_date=?, play_count=?, like_count=?, comment_count=?, favorite_count=?, share_count=?, conversion_result=?, screenshot_ids=?, notes=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(title, platform || '', video_url || '', publish_date || '', play_count || 0, like_count || 0, comment_count || 0, favorite_count || 0, share_count || 0, conversion_result || '', screenshot_ids || '', notes || '', id);

    await logOperation('update', 'success_case', id, `编辑了爆款案例「${title}」`);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM success_cases WHERE id = ?").get(id);
    if (!existing) return errorResponse('案例不存在', 404);

    db.prepare("DELETE FROM success_cases WHERE id = ?").run(id);
    await logOperation('delete', 'success_case', id, '删除了爆款案例');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
