import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { logOperation } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const ipId = parseId(await params);
    const items = db.prepare(
      "SELECT * FROM success_cases WHERE ip_id = ? ORDER BY created_at DESC"
    ).all(ipId);
    return jsonResponse(items);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const ipId = parseId(await params);
    const existing = db.prepare("SELECT * FROM ip WHERE id = ? AND deleted_at IS NULL").get(ipId);
    if (!existing) return errorResponse('IP 不存在', 404);

    const data = await request.json();
    const { title, platform, video_url, publish_date, play_count, like_count, comment_count, favorite_count, share_count, conversion_result, screenshot_ids, notes } = data;
    if (!title) return errorResponse('请输入案例标题', 400);

    const result = db.prepare(`
      INSERT INTO success_cases (ip_id, title, platform, video_url, publish_date, play_count, like_count, comment_count, favorite_count, share_count, conversion_result, screenshot_ids, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ipId, title, platform || '', video_url || '', publish_date || '', play_count || 0, like_count || 0, comment_count || 0, favorite_count || 0, share_count || 0, conversion_result || '', screenshot_ids || '', notes || '');

    await logOperation('create', 'success_case', result.lastInsertRowid as number, `添加了爆款案例「${title}」`);
    const sc = db.prepare("SELECT * FROM success_cases WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(sc, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
