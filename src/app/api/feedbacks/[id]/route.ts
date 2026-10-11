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
    const existing = db.prepare("SELECT * FROM feedbacks WHERE id = ?").get(id);
    if (!existing) return errorResponse('反馈不存在', 404);

    const data = await request.json();
    const { source, rating, content, screenshot_ids, reviewer_name, related_project } = data;

    db.prepare(`
      UPDATE feedbacks SET source=?, rating=?, content=?, screenshot_ids=?, reviewer_name=?, related_project=?
      WHERE id=?
    `).run(source, rating || 0, content || '', screenshot_ids || '', reviewer_name || '', related_project || '', id);

    await logOperation('update', 'feedback', id, '编辑了好评反馈');
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
    const existing = db.prepare("SELECT * FROM feedbacks WHERE id = ?").get(id);
    if (!existing) return errorResponse('反馈不存在', 404);

    db.prepare("DELETE FROM feedbacks WHERE id = ?").run(id);
    await logOperation('delete', 'feedback', id, '删除了好评反馈');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
