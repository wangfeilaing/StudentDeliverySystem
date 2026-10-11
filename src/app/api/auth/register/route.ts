import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';

export async function POST(request: Request) {
  try {
    const { username, password, display_name, phone } = await request.json();
    if (!username || !password) return errorResponse('用户名和密码不能为空', 400);
    if (password.length < 6) return errorResponse('密码至少6位', 400);

    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) return errorResponse('用户名已存在', 400);

    db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role, status, phone) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(username, hashPassword(password), display_name || '', 'operator', 'disabled', phone || '');

    return jsonResponse({ message: '注册申请已提交，请等待管理员审核' }, 201);
  } catch {
    return errorResponse('注册失败', 500);
  }
}
