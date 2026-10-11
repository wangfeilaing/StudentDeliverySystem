import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId, parsePagination } from '@/lib/api-helpers';
import { saveUpload } from '@/lib/storage';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const id = parseId(await params);
    const { page, limit, offset } = parsePagination(request);
    const total = (db.prepare("SELECT COUNT(*) as count FROM screenshot WHERE ip_id = ? AND deleted_at IS NULL").get(id) as { count: number }).count;
    const items = db.prepare(
      "SELECT * FROM screenshot WHERE ip_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(id, limit, offset);
    return jsonResponse({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
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
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM ip WHERE id = ?").get(id);
    if (!existing) return errorResponse('IP 不存在', 404);

    const formData = await request.formData();
    const title = (formData.get('title') as string) || '';
    const category = (formData.get('category') as string) || '';
    const notes = (formData.get('notes') as string) || '';
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return errorResponse('请选择文件', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { filePath } = saveUpload(buffer, file.name, 'screenshots', id);

    const result = db.prepare(`
      INSERT INTO screenshot (ip_id, title, category, file_path, file_size, notes)
      VALUES (@ip_id, @title, @category, @file_path, @file_size, @notes)
    `).run({
      ip_id: id,
      title,
      category,
      file_path: filePath,
      file_size: file.size,
      notes,
    });

    db.prepare("UPDATE ip SET updated_at = datetime('now','localtime') WHERE id = ?").run(id);

    const screenshot = db.prepare("SELECT * FROM screenshot WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(screenshot, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
