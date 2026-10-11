import { getDb } from '@/lib/db';
import { verifyPassword, createSessionToken } from '@/lib/auth';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) return errorResponse('请输入用户名和密码', 400);

    const db = getDb();
    const user = db.prepare(
      "SELECT id, username, password_hash, display_name, role, status, avatar_path, phone FROM users WHERE username = ?"
    ).get(username) as Record<string, unknown> | undefined;

    if (!user || !verifyPassword(password, user.password_hash as string)) {
      return errorResponse('用户名或密码错误', 401);
    }
    if (user.status !== 'active') return errorResponse('账号已被禁用', 403);

    const { token, expires } = createSessionToken(user.id as number);
    const cookieStore = await cookies();
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      expires,
      path: '/',
    });

    db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id);

    // 自动备份的触发点：挑「登录成功」这个低频且可预期的事件。
    // 失败不影响登录，内部还有 24 小时节流与开关判断。
    try {
      const { maybeAutoBackup } = await import('@/lib/backup');
      const result = maybeAutoBackup();
      if (!result.ran && result.reason.startsWith('error')) {
        console.error('[login] 自动备份未完成：', result.reason);
      }
    } catch (e) {
      console.error('[login] 自动备份触发失败：', (e as Error).message);
    }

    return jsonResponse({
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        avatar_path: user.avatar_path,
        phone: user.phone,
      },
    });
  } catch {
    return errorResponse('登录失败', 500);
  }
}
