import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

export async function GET() {
  try {
    const db = getDb();
    const tags = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM ip_tags WHERE tag_id = t.id) +
        (SELECT COUNT(*) FROM material_tags WHERE tag_id = t.id) as usage_count
      FROM tags t ORDER BY t.group_name, t.name
    `).all();
    return jsonResponse(tags);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const { name, color, group_name } = await request.json();
    if (!name) return errorResponse('标签名不能为空', 400);

    const existing = db.prepare("SELECT id FROM tags WHERE name = ?").get(name);
    if (existing) return errorResponse('标签名已存在', 400);

    const result = db.prepare(
      "INSERT INTO tags (name, color, group_name) VALUES (?, ?, ?)"
    ).run(name, color || '#3b82f6', group_name || '');

    await logOperation('create', 'tag', result.lastInsertRowid as number, `创建了标签「${name}」`);
    const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(tag, 201);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
