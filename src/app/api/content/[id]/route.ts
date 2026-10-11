import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

// GET /api/content/[id] — 单条详情
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id);
    if (!item) return errorResponse('内容不存在', 404);
    return jsonResponse(item);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

// 允许编辑的字段
const EDITABLE = ['author', 'title', 'original_text', 'transcript', 'rewritten_text', 'digg_count', 'status', 'notes', 'tags', 'video_url', 'download_url'];

// PATCH /api/content/[id] — 更新（保存改写结果、编辑文案等）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare('SELECT id FROM content_items WHERE id = ?').get(id);
    if (!existing) return errorResponse('内容不存在', 404);

    const body = await request.json().catch(() => ({}));
    const sets: string[] = [];
    const values: Record<string, unknown> = { id };
    for (const key of EDITABLE) {
      if (key in body) {
        sets.push(`${key} = @${key}`);
        values[key] = body[key];
      }
    }
    if (sets.length === 0) return errorResponse('没有可更新的字段', 400);
    sets.push("updated_at = datetime('now','localtime')");

    db.prepare(`UPDATE content_items SET ${sets.join(', ')} WHERE id = @id`).run(values);
    await logOperation('update', 'content', id, '更新了文案内容');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

// DELETE /api/content/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    db.prepare('DELETE FROM content_items WHERE id = ?').run(id);
    await logOperation('delete', 'content', id, '删除了文案');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
