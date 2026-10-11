import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM tags WHERE id = ?").get(id);
    if (!existing) return errorResponse('标签不存在', 404);

    const { name, color, group_name } = await request.json();
    db.prepare("UPDATE tags SET name=?, color=?, group_name=? WHERE id=?").run(name, color, group_name || '', id);

    await logOperation('update', 'tag', id, `编辑了标签「${name}」`);
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
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const id = parseId(await params);
    db.prepare("DELETE FROM ip_tags WHERE tag_id = ?").run(id);
    db.prepare("DELETE FROM material_tags WHERE tag_id = ?").run(id);
    db.prepare("DELETE FROM tags WHERE id = ?").run(id);

    await logOperation('delete', 'tag', id, '删除了标签');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
