import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const id = parseId(await params);
    const product = db.prepare("SELECT * FROM product_types WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!product) return errorResponse('产品不存在', 404);

    const rows = db.prepare(`
      SELECT
        ip.id, ip.name, ip.status, ip.batch_number, ip.course_start_date,
        ip.avatar_path, ip.service_tier, ip.updated_at,
        COUNT(dt.id) as total_tasks,
        SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
      FROM ip
      LEFT JOIN client_delivery_tasks dt ON dt.client_id = ip.id
      WHERE ip.product_type_id = ? AND ip.deleted_at IS NULL
      GROUP BY ip.id
      ORDER BY ip.batch_number ASC, ip.sort_order ASC, ip.updated_at DESC
    `).all(id) as Array<{
      id: number; name: string; status: string; batch_number: string;
      course_start_date: string; avatar_path: string | null;
      service_tier: string; updated_at: string;
      total_tasks: number; completed_tasks: number;
    }>;

    // Group by batch_number
    const batchMap = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.batch_number || '未分期';
      if (!batchMap.has(key)) batchMap.set(key, []);
      batchMap.get(key)!.push(row);
    }

    const batches = Array.from(batchMap.entries()).map(([batchNumber, ips]) => {
      const ipList = ips.map(ip => ({
        id: ip.id,
        name: ip.name,
        status: ip.status,
        avatar_path: ip.avatar_path,
        course_start_date: ip.course_start_date,
        service_tier: ip.service_tier,
        updated_at: ip.updated_at,
        total_tasks: ip.total_tasks,
        completed_tasks: ip.completed_tasks,
        progress: ip.total_tasks > 0 ? Math.round((ip.completed_tasks / ip.total_tasks) * 100) : 0,
      }));

      const totalCompleted = ips.reduce((s, ip) => s + ip.completed_tasks, 0);
      const totalTasks = ips.reduce((s, ip) => s + ip.total_tasks, 0);

      return {
        batch_number: batchNumber,
        ips: ipList,
        ip_count: ips.length,
        total_tasks: totalTasks,
        completed_tasks: totalCompleted,
        progress: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
      };
    });

    const allCompleted = rows.reduce((s, ip) => s + ip.completed_tasks, 0);
    const allTasks = rows.reduce((s, ip) => s + ip.total_tasks, 0);

    return jsonResponse({
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        service_days: product.service_days,
        description: product.description,
        status: product.status,
      },
      batches,
      total_ips: rows.length,
      total_tasks: allTasks,
      completed_tasks: allCompleted,
      progress: allTasks > 0 ? Math.round((allCompleted / allTasks) * 100) : 0,
    });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
