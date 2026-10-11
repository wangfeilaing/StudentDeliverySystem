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
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!existing) return errorResponse('用户不存在', 404);

    const { display_name, role, status } = await request.json();
    db.prepare("UPDATE users SET display_name=?, role=?, status=?, updated_at=datetime('now','localtime') WHERE id=?").run(display_name || '', role, status, id);

    await logOperation('update', 'user', id, '编辑了用户信息');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
