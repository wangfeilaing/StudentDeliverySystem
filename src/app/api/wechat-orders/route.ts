import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parsePagination } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { syncWechatOrders } from '@/lib/wechat-store';

// GET /api/wechat-orders — list orders with optional status filter & search
export async function GET(request: Request) {
  try {
    const db = getDb();
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('q') || '';
    const { page, limit, offset } = parsePagination(request);

    const product = url.searchParams.get('product') || '';
    const sales = url.searchParams.get('sales') || '';

    let where = 'WHERE 1=1';
    const params: Record<string, string | number> = {};
    if (status) {
      where += ' AND status = @status';
      params.status = parseInt(status, 10);
    }
    if (search) {
      where += ' AND (buyer_name LIKE @s OR buyer_phone LIKE @s OR order_id LIKE @s OR product_names LIKE @s)';
      params.s = `%${search}%`;
    }
    if (product) {
      where += ' AND product_names LIKE @product';
      params.product = `%${product}%`;
    }
    const batchTotals: Array<{ start_time: string; end_time: string; count: number }> = [];

    if (sales) {
      const ranges = db.prepare(
        "SELECT start_time, end_time FROM sales_assignments WHERE sales_name = ? ORDER BY start_time"
      ).all(sales) as Array<{ start_time: string; end_time: string | null }>;
      if (ranges.length === 0) {
        where += ' AND 1=0';
      } else {
        const clauses = ranges.map((_, i) => {
          params[`st${i}`] = ranges[i].start_time;
          if (ranges[i].end_time) {
            params[`et${i}`] = ranges[i].end_time;
            return `(create_time >= @st${i} AND create_time <= @et${i})`;
          }
          // Open-ended (still active) — include up to now
          return `(create_time >= @st${i})`;
        });
        where += ` AND (${clauses.join(' OR ')})`;

        for (let i = 0; i < ranges.length; i++) {
          const endTime = ranges[i].end_time;
          if (endTime) {
            const c = db.prepare(
              "SELECT COUNT(*) as c FROM wechat_orders WHERE create_time >= ? AND create_time <= ?"
            ).get(ranges[i].start_time, endTime) as { c: number };
            batchTotals.push({ start_time: ranges[i].start_time, end_time: endTime, count: c.c });
          } else {
            const c = db.prepare(
              "SELECT COUNT(*) as c FROM wechat_orders WHERE create_time >= ?"
            ).get(ranges[i].start_time) as { c: number };
            batchTotals.push({ start_time: ranges[i].start_time, end_time: '进行中', count: c.c });
          }
        }
      }
    }

    const total = db.prepare(`SELECT COUNT(*) as c FROM wechat_orders ${where}`).get(params) as { c: number };
    const items = db.prepare(`
      SELECT * FROM wechat_orders ${where}
      ORDER BY create_time DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });

    // Attach wecom binding info
    const itemOrderIds = (items as Array<{ order_id: string }>).map(i => i.order_id);
    const bindingMap: Record<string, {
      sales_name: string;
      added_at: string;
      contact_name: string;
      state: string;
      match_method: string;
      confidence: number;
    }> = {};
    if (itemOrderIds.length > 0) {
      const placeholders = itemOrderIds.map(() => '?').join(',');
      const bindings = db.prepare(
        `SELECT order_id, sales_name, added_at, contact_name, state, match_method, confidence
         FROM wecom_bindings WHERE order_id IN (${placeholders})`
      ).all(...itemOrderIds) as Array<{
        order_id: string;
        sales_name: string;
        added_at: string;
        contact_name: string;
        state: string;
        match_method: string;
        confidence: number;
      }>;
      for (const b of bindings) {
        bindingMap[b.order_id] = b;
      }
    }
    const itemsWithWecom = (items as Array<Record<string, unknown>>).map(item => ({
      ...item,
      wecom_sales: bindingMap[item.order_id as string]?.sales_name || null,
      wecom_added_at: bindingMap[item.order_id as string]?.added_at || null,
      wecom_contact_name: bindingMap[item.order_id as string]?.contact_name || null,
      wecom_state: bindingMap[item.order_id as string]?.state || '',
      wecom_match_method: bindingMap[item.order_id as string]?.match_method || '',
      wecom_confidence: bindingMap[item.order_id as string]?.confidence || 0,
    }));

    return jsonResponse({ items: itemsWithWecom, total: total.c, page, limit, totalPages: Math.ceil(total.c / limit), batchTotals });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

// PATCH /api/wechat-orders — update order remark
export async function PATCH(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator', 'business']);
    const body = await request.json();
    const { orderId, remark } = body;
    if (!orderId) return errorResponse('缺少订单ID', 400);
    const db = getDb();
    db.prepare('UPDATE wechat_orders SET remark = ? WHERE order_id = ?').run(remark || '', orderId);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}

// POST /api/wechat-orders — trigger manual sync (body: { days?: number })
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const body = await request.json().catch(() => ({}));
    const days = body.days || 30;
    const result = await syncWechatOrders(days);
    if (result.error) return errorResponse(result.error, 400);
    return jsonResponse({ message: `同步完成：新增 ${result.newOrders} 单，共拉取 ${result.totalOrders} 单` });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
