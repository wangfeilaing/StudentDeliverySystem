import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM video WHERE id = ? AND deleted_at IS NULL").get(id) as Record<string, unknown> | undefined;
    if (!existing) return errorResponse('视频不存在', 404);

    // Soft delete
    db.prepare("UPDATE video SET deleted_at = datetime('now','localtime') WHERE id = ?").run(id);
    db.prepare("UPDATE ip SET updated_at = datetime('now','localtime') WHERE id = ?").run(existing.ip_id);

    await logOperation('delete', 'video', id, `删除了视频「${existing.title || '无标题'}」`);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
