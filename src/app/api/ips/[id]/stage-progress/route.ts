import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

// GET /api/ips/[id]/stage-progress — returns stage list + completion status
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const ipId = parseId(await params);

    // Get IP info for product_type_id
    const ip = db.prepare("SELECT product_type_id FROM ip WHERE id = ?").get(ipId) as { product_type_id: number | null } | undefined;
    if (!ip) return errorResponse('IP 不存在', 404);

    // Get distinct stages from templates for this product type
    const stages = db.prepare(`
      SELECT DISTINCT stage_name
      FROM delivery_templates
      WHERE product_type_id = ? AND status = 'active'
      ORDER BY sort_order
    `).all(ip.product_type_id) as Array<{ stage_name: string }>;

    // Get completion status from ip_stage_progress
    const progress = db.prepare(
      "SELECT stage_name, completed_at, completed_by FROM ip_stage_progress WHERE ip_id = ?"
    ).all(ipId) as Array<{ stage_name: string; completed_at: string | null; completed_by: number | null }>;

    const progressMap: Record<string, { completed_at: string | null; completed_by: number | null }> = {};
    progress.forEach(p => { progressMap[p.stage_name] = { completed_at: p.completed_at, completed_by: p.completed_by }; });

    // Get tasks grouped by stage
    const tasks = db.prepare(
      "SELECT * FROM client_delivery_tasks WHERE client_id = ? ORDER BY sort_order"
    ).all(ipId) as Array<{
      id: number; stage_name: string; task_name: string; description: string;
      status: string; due_date: string; completed_at: string | null;
      completion_note: string; feishu_doc_url: string;
    }>;

    const result = stages.map(s => ({
      stage_name: s.stage_name,
      completed_at: progressMap[s.stage_name]?.completed_at || null,
      completed_by: progressMap[s.stage_name]?.completed_by || null,
      tasks: tasks.filter(t => t.stage_name === s.stage_name),
    }));

    return jsonResponse(result);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

// PUT /api/ips/[id]/stage-progress — toggle stage completion
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const ipId = parseId(await params);
    const { stage_name, completed } = await request.json();

    if (!stage_name) return errorResponse('缺少阶段名称', 400);

    if (completed) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      db.prepare(`
        INSERT INTO ip_stage_progress (ip_id, stage_name, completed_at, completed_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ip_id, stage_name) DO UPDATE SET completed_at = ?, completed_by = ?
      `).run(ipId, stage_name, now, user.id, now, user.id);
    } else {
      db.prepare(
        "UPDATE ip_stage_progress SET completed_at = NULL, completed_by = NULL WHERE ip_id = ? AND stage_name = ?"
      ).run(ipId, stage_name);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
