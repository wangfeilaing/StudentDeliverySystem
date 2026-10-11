import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const id = parseId(await params);
    const item = db.prepare("SELECT * FROM product_types WHERE id = ?").get(id);
    if (!item) return errorResponse('产品不存在', 404);
    return jsonResponse(item);
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
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM product_types WHERE id = ?").get(id) as Record<string, unknown>;
    if (!existing) return errorResponse('产品不存在', 404);

    const { name, price, service_days, description, status } = await request.json();
    if (!name || !name.trim()) return errorResponse('产品名称不能为空', 400);

    db.prepare(`
      UPDATE product_types SET name=?, price=?, service_days=?, description=?, status=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(
      name.trim(),
      price ?? (existing.price as number),
      service_days ?? (existing.service_days as number),
      description ?? (existing.description as string),
      status ?? (existing.status as string),
      id
    );

    const item = db.prepare("SELECT * FROM product_types WHERE id = ?").get(id);
    return jsonResponse(item);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM product_types WHERE id = ?").get(id);
    if (!existing) return errorResponse('产品不存在', 404);

    db.prepare("UPDATE product_types SET status = 'inactive', updated_at = datetime('now','localtime') WHERE id = ?").run(id);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
