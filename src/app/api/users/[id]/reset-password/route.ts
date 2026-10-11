import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { hashPassword } from '@/lib/auth';
import { logOperation } from '@/lib/logger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!existing) return errorResponse('用户不存在', 404);

    const { new_password } = await request.json();
    if (!new_password || new_password.length < 6) return errorResponse('密码至少6位', 400);

    db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now','localtime') WHERE id=?").run(hashPassword(new_password), id);

    await logOperation('update', 'user', id, '重置了用户密码');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
