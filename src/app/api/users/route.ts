import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { hashPassword } from '@/lib/auth';
import { logOperation } from '@/lib/logger';

export async function GET() {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const users = db.prepare("SELECT id, username, display_name, role, status, phone, last_login_at, created_at FROM users ORDER BY created_at DESC").all();
    return jsonResponse(users);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const { username, password, display_name, role } = await request.json();
    if (!username || !password) return errorResponse('用户名和密码不能为空', 400);
    if (password.length < 6) return errorResponse('密码至少6位', 400);

    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) return errorResponse('用户名已存在', 400);

    const result = db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)"
    ).run(username, hashPassword(password), display_name || '', role || 'operator');

    await logOperation('create', 'user', result.lastInsertRowid as number, `创建了用户「${username}」`);
    const user = db.prepare("SELECT id, username, display_name, role, status, phone, last_login_at, created_at FROM users WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(user, 201);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
