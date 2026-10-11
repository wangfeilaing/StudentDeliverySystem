import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { saveUpload } from '@/lib/storage';

// GET /api/ips/[id]/delivery-tasks/[taskId]/attachments
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const db = getDb();
    const { taskId: taskIdStr } = await params;
    const taskId = parseInt(taskIdStr, 10);
    if (isNaN(taskId)) return errorResponse('无效 ID', 400);

    const items = db.prepare(
      "SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at DESC"
    ).all(taskId);
    return jsonResponse(items);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

// POST /api/ips/[id]/delivery-tasks/[taskId]/attachments
export async function POST(
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

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) return errorResponse('请选择文件', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { filePath } = saveUpload(buffer, file.name, 'delivery', clientId);
    const fileType = file.type || '';

    const result = db.prepare(`
      INSERT INTO task_attachments (client_id, task_id, file_name, file_path, file_type, file_size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(clientId, taskId, file.name, filePath, fileType, file.size, user.id);

    // Log the upload
    db.prepare(`
      INSERT INTO delivery_logs (client_id, task_id, operator_id, operator_name, action_type, content)
      VALUES (?, ?, ?, ?, 'upload_attachment', ?)
    `).run(clientId, taskId, user.id, user.display_name || user.username, `上传了附件「${file.name}」`);

    const item = db.prepare("SELECT * FROM task_attachments WHERE id = ?").get(result.lastInsertRowid);
    return jsonResponse(item, 201);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
