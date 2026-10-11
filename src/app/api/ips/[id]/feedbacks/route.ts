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
      "SELECT * FROM feedbacks WHERE ip_id = ? ORDER BY created_at DESC"
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
    const { source, rating, content, screenshot_ids, reviewer_name, related_project } = data;
    if (!source) return errorResponse('请选择来源', 400);

    const result = db.prepare(`
      INSERT INTO feedbacks (ip_id, source, rating, content, screenshot_ids, reviewer_name, related_project)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ipId, source, rating || 0, content || '', screenshot_ids || '', reviewer_name || '', related_project || '');

    await logOperation('create', 'feedback', result.lastInsertRowid as number, `添加了好评反馈`);
    const feedback = db.prepare("SELECT * FROM feedbacks WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(feedback, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
