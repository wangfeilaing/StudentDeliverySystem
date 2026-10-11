import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const productId = parseId(await params);
    const items = db.prepare(
      "SELECT * FROM delivery_templates WHERE product_type_id = ? AND status = 'active' ORDER BY sort_order ASC"
    ).all(productId);
    return jsonResponse(items);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const productId = parseId(await params);
    const existing = db.prepare("SELECT id FROM product_types WHERE id = ?").get(productId);
    if (!existing) return errorResponse('产品不存在', 404);

    const { templates } = await request.json();
    if (!Array.isArray(templates)) return errorResponse('templates 必须是数组', 400);

    const deleteStmt = db.prepare("DELETE FROM delivery_templates WHERE product_type_id = ?");
    const insertStmt = db.prepare(
      "INSERT INTO delivery_templates (product_type_id, stage_name, task_name, description, due_day_offset, sort_order, is_required, default_role, feishu_doc_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const runAll = db.transaction(() => {
      deleteStmt.run(productId);
      templates.forEach((t, i) => {
        insertStmt.run(
          productId,
          t.stage_name || '',
          t.task_name || '',
          t.description || '',
          t.due_day_offset || 7,
          i,
          t.is_required !== false ? 1 : 0,
          t.default_role || '',
          t.feishu_doc_url || ''
        );
      });
    });
    runAll();

    const items = db.prepare(
      "SELECT * FROM delivery_templates WHERE product_type_id = ? ORDER BY sort_order ASC"
    ).all(productId);
    return jsonResponse(items);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
