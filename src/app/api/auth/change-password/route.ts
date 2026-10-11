import { getDb } from '@/lib/db';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { requireAuth } from '@/lib/session';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { oldPassword, newPassword } = await request.json();
    if (!oldPassword || !newPassword) return errorResponse('请输入旧密码和新密码', 400);
    if (newPassword.length < 6) return errorResponse('新密码至少6位', 400);

    const db = getDb();
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
    if (!verifyPassword(oldPassword, row.password_hash)) return errorResponse('旧密码错误', 400);

    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(hashPassword(newPassword), user.id);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse('修改密码失败', 500);
  }
}
