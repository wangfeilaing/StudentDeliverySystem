import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

// GET /api/sales-assignments — list all assignments
export async function GET() {
  try {
    const db = getDb();
    const items = db.prepare(
      "SELECT *, end_time IS NULL as is_active FROM sales_assignments ORDER BY start_time DESC"
    ).all();
    return jsonResponse({ items });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

// POST /api/sales-assignments — start 下量 (create assignment with start_time=now)
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const body = await request.json();
    const { sales_name } = body;
    if (!sales_name) {
      return errorResponse('请选择销售', 400);
    }
    const db = getDb();

    // Auto-close any other currently open assignments (only one person active at a time)
    db.prepare(
      "UPDATE sales_assignments SET end_time = datetime('now','localtime') WHERE end_time IS NULL"
    ).run();

    // Create new open-ended assignment
    db.prepare(
      "INSERT INTO sales_assignments (sales_name, start_time) VALUES (?, datetime('now','localtime'))"
    ).run(sales_name);

    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}

// PUT /api/sales-assignments — stop 下量 (close active assignment for a sales person)
export async function PUT(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const body = await request.json();
    const { sales_name } = body;
    if (!sales_name) {
      db.prepare(
        "UPDATE sales_assignments SET end_time = datetime('now','localtime') WHERE end_time IS NULL"
      ).run();
    } else {
      db.prepare(
        "UPDATE sales_assignments SET end_time = datetime('now','localtime') WHERE sales_name = ? AND end_time IS NULL"
      ).run(sales_name);
    }
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}

// DELETE /api/sales-assignments — delete assignment by id
export async function DELETE(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return errorResponse('缺少 ID', 400);
    const db = getDb();
    db.prepare('DELETE FROM sales_assignments WHERE id = ?').run(parseInt(id));
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
