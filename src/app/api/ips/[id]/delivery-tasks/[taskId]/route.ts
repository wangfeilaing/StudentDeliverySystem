import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

// PUT /api/ips/[id]/delivery-tasks/[taskId] — update a task (complete, reopen, edit)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const user = await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const { id: clientIdStr, taskId: taskIdStr } = await params;
    const clientId = parseInt(clientIdStr, 10);
    const taskId = parseInt(taskIdStr, 10);
    if (isNaN(clientId) || isNaN(taskId)) return errorResponse('无效 ID', 400);

    const existing = db.prepare(
      "SELECT * FROM client_delivery_tasks WHERE id = ? AND client_id = ?"
    ).get(taskId, clientId) as Record<string, unknown> | undefined;
    if (!existing) return errorResponse('任务不存在', 404);

    const body = await request.json();
    const { status, stage_name, task_name, description, due_date, owner_id, completion_note, is_required, feishu_doc_url, sync_to_feishu } = body;

    const oldStatus = existing.status as string;
    const newStatus = status || oldStatus;

    const stmt = db.prepare(`
      UPDATE client_delivery_tasks SET
        status = ?, stage_name = COALESCE(?, stage_name),
        task_name = COALESCE(?, task_name), description = COALESCE(?, description),
        due_date = COALESCE(?, due_date), owner_id = ?,
        completion_note = COALESCE(?, completion_note),
        is_required = ?,
        feishu_doc_url = COALESCE(?, feishu_doc_url),
        completed_at = ?,
        completed_by = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `);

    // 本地时间字符串，与库里其它 datetime('now','localtime') 字段保持同一口径。
    // 原先用 toISOString() 写的是 UTC，会比本地时间差 8 小时。
    const localNow = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    const now = newStatus === 'completed'
      ? localNow()
      : (newStatus !== 'completed' ? null : existing.completed_at);
    const completedBy = newStatus === 'completed' ? user.id : (newStatus !== 'completed' ? null : existing.completed_by);

    stmt.run(
      newStatus,
      stage_name ?? null, task_name ?? null, description ?? null,
      due_date ?? null,
      owner_id ?? existing.owner_id ?? null,
      completion_note ?? null,
      is_required !== undefined ? (is_required ? 1 : 0) : existing.is_required,
      feishu_doc_url ?? null,
      now,
      completedBy,
      taskId
    );

    // Log the action
    let actionType = 'update_task';
    let content = `更新了任务「${task_name || existing.task_name}」`;
    if (oldStatus !== newStatus) {
      if (newStatus === 'completed') {
        actionType = 'complete_task';
        content = `完成了任务「${task_name || existing.task_name}」`;
        if (completion_note) content += `，备注：${completion_note}`;
      } else if (oldStatus === 'completed') {
        actionType = 'reopen_task';
        content = `重新打开了任务「${task_name || existing.task_name}」`;
      }
    }

    db.prepare(`
      INSERT INTO delivery_logs (client_id, task_id, operator_id, operator_name, action_type, content, old_status, new_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(clientId, taskId, user.id, user.display_name || user.username, actionType, content, oldStatus, newStatus);

    // Fire-and-forget Feishu sync on completion (with block tracking)
    if (newStatus === 'completed') {
      const docUrl = feishu_doc_url || (existing.feishu_doc_url as string);
      if (docUrl && sync_to_feishu !== false) {
        const userName = user.display_name || user.username;
        const taskName = (task_name || existing.task_name) as string;
        const note = (completion_note || '') as string;
        const nowStr = now as string;
        import('@/lib/feishu-sync').then(({ appendCompletionToFeishuDocTracked }) => {
          appendCompletionToFeishuDocTracked(docUrl, taskName, nowStr, userName, note, taskId, clientId)
            .catch(err => console.error('Feishu sync error:', err));
        });
      }
    }

    const task = db.prepare("SELECT * FROM client_delivery_tasks WHERE id = ?").get(taskId);
    return jsonResponse(task);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

// DELETE /api/ips/[id]/delivery-tasks/[taskId]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const user = await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const { id: clientIdStr, taskId: taskIdStr } = await params;
    const clientId = parseInt(clientIdStr, 10);
    const taskId = parseInt(taskIdStr, 10);
    if (isNaN(clientId) || isNaN(taskId)) return errorResponse('无效 ID', 400);

    const existing = db.prepare(
      "SELECT * FROM client_delivery_tasks WHERE id = ? AND client_id = ?"
    ).get(taskId, clientId) as Record<string, unknown> | undefined;
    if (!existing) return errorResponse('任务不存在', 404);

    db.prepare("DELETE FROM client_delivery_tasks WHERE id = ?").run(taskId);

    db.prepare(`
      INSERT INTO delivery_logs (client_id, task_id, operator_id, operator_name, action_type, content)
      VALUES (?, ?, ?, ?, 'delete_task', ?)
    `).run(clientId, taskId, user.id, user.display_name || user.username, `删除了任务「${existing.task_name}」`);

    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
