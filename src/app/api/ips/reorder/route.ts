import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

// POST /api/ips/reorder
// Body: { orderedIds: number[] }
export async function PUT(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const { orderedIds } = await request.json();

    if (!Array.isArray(orderedIds)) {
      return errorResponse('orderedIds 必须为数组', 400);
    }

    const update = db.prepare("UPDATE ip SET sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?");
    const transaction = db.transaction(() => {
      orderedIds.forEach((id, index) => update.run(index, id));
    });
    transaction();

    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
