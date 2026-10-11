import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

export async function GET() {
  try {
    const db = getDb();
    const items = db.prepare(
      "SELECT * FROM product_types WHERE status = 'active' ORDER BY sort_order ASC, id ASC"
    ).all() as Array<Record<string, unknown>>;

    // Attach IP count + preview list per product (with delivery progress)
    const result = items.map(p => {
      const ips = db.prepare(`
        SELECT
          ip.id, ip.name, ip.avatar_path,
          COUNT(dt.id) as total_tasks,
          SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
        FROM ip
        LEFT JOIN client_delivery_tasks dt ON dt.client_id = ip.id
        WHERE ip.product_type_id = ? AND ip.deleted_at IS NULL
        GROUP BY ip.id
        ORDER BY ip.sort_order ASC, ip.name ASC
      `).all(p.id) as Array<{ id: number; name: string; avatar_path: string | null; total_tasks: number; completed_tasks: number }>;
      return {
        ...p,
        ip_count: ips.length,
        ips: ips.map(ip => ({
          ...ip,
          progress: ip.total_tasks > 0 ? Math.round((ip.completed_tasks / ip.total_tasks) * 100) : 0,
        })),
      };
    });

    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const { name, price, service_days, description } = await request.json();

    if (!name || !name.trim()) {
      return errorResponse('产品名称不能为空', 400);
    }

    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) as m FROM product_types"
    ).get() as { m: number };

    const result = db.prepare(
      "INSERT INTO product_types (name, price, service_days, description, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).run(name.trim(), price || 0, service_days || 90, description || '', maxOrder.m + 1);

    const item = db.prepare("SELECT * FROM product_types WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(item, 201);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
