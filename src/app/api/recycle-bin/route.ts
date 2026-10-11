import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';
import { deleteFile } from '@/lib/storage';

export async function GET(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'screenshot';

    let items: unknown[] = [];
    if (type === 'ip') {
      items = db.prepare("SELECT * FROM ip WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all();
    } else if (type === 'screenshot') {
      items = db.prepare("SELECT s.*, ip.name as ip_name FROM screenshot s JOIN ip ON ip.id = s.ip_id WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC").all();
    } else if (type === 'video') {
      items = db.prepare("SELECT v.*, ip.name as ip_name FROM video v JOIN ip ON ip.id = v.ip_id WHERE v.deleted_at IS NOT NULL ORDER BY v.deleted_at DESC").all();
    }

    return jsonResponse(items);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const { type, id } = await request.json();
    const db = getDb();

    if (type === 'screenshot') {
      db.prepare("UPDATE screenshot SET deleted_at = NULL WHERE id = ?").run(id);
    } else if (type === 'video') {
      db.prepare("UPDATE video SET deleted_at = NULL WHERE id = ?").run(id);
    } else if (type === 'ip') {
      db.prepare("UPDATE ip SET deleted_at = NULL WHERE id = ?").run(id);
      db.prepare("UPDATE screenshot SET deleted_at = NULL WHERE ip_id = ? AND deleted_at IS NOT NULL").run(id);
      db.prepare("UPDATE video SET deleted_at = NULL WHERE ip_id = ? AND deleted_at IS NOT NULL").run(id);
    }

    await logOperation('restore', type, id, `恢复了${type}`);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
