import { getDb } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const currentUser = await requireAuth(['super_admin', 'admin']);
    const { targetUserId } = await request.json();
    if (!targetUserId) return errorResponse('缺少目标用户ID', 400);

    const db = getDb();
    const targetUser = db.prepare(
      "SELECT id, username, display_name, role FROM users WHERE id = ? AND status = 'active'"
    ).get(targetUserId) as Record<string, unknown> | undefined;

    if (!targetUser) return errorResponse('目标用户不存在或已禁用', 404);

    const { token, expires } = createSessionToken(targetUserId as number);
    const cookieStore = await cookies();

    // Save current session for switch-back
    const currentSession = cookieStore.get('session')?.value;
    if (currentSession) {
      cookieStore.set('original_session', currentSession, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        path: '/',
      });
    }

    cookieStore.set('session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      expires,
      path: '/',
    });

    await logOperation('switch_account', 'user', targetUserId as number,
      `${currentUser.display_name || currentUser.username} 切换到了「${targetUser.display_name || targetUser.username}」`);

    return jsonResponse({
      user: {
        id: targetUser.id,
        username: targetUser.username,
        display_name: targetUser.display_name,
        role: targetUser.role,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
