import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { saveUpload } from '@/lib/storage';

// GET /api/ips/[id]/delivery-tasks — list all tasks for an IP
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const clientId = parseId(await params);
    const tasks = db.prepare(
      "SELECT * FROM client_delivery_tasks WHERE client_id = ? ORDER BY sort_order ASC"
    ).all(clientId);
    return jsonResponse(tasks);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

// POST /api/ips/[id]/delivery-tasks — create a manual task
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const clientId = parseId(await params);

    const body = await request.json();
    const { stage_name, task_name, description, due_date, owner_id, feishu_doc_url } = body;

    if (!task_name || !task_name.trim()) {
      return errorResponse('任务名称不能为空', 400);
    }

    const maxSort = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) as m FROM client_delivery_tasks WHERE client_id = ?"
    ).get(clientId) as { m: number };

    const result = db.prepare(`
      INSERT INTO client_delivery_tasks (client_id, stage_name, task_name, description, status, due_date, owner_id, sort_order, is_required, feishu_doc_url)
      VALUES (?, ?, ?, ?, 'not_started', ?, ?, ?, 0, ?)
    `).run(clientId, stage_name || '', task_name.trim(), description || '', due_date || '', owner_id || null, maxSort.m + 1, feishu_doc_url || '');

    // Log
    db.prepare(`
      INSERT INTO delivery_logs (client_id, task_id, operator_id, operator_name, action_type, content)
      VALUES (?, ?, ?, ?, 'create_task', ?)
    `).run(clientId, result.lastInsertRowid, user.id, user.display_name || user.username, `手动创建了任务「${task_name.trim()}」`);

    const task = db.prepare("SELECT * FROM client_delivery_tasks WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(task, 201);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
