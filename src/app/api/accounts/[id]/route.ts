import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM social_account WHERE id = ?").get(id);
    if (!existing) return errorResponse('账号不存在', 404);

    const data = await request.json();
    const { platform, account_name, account_url, follower_count, notes } = data;

    db.prepare(`
      UPDATE social_account SET platform=@platform, account_name=@account_name,
        account_url=@account_url, follower_count=@follower_count, notes=@notes,
        updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({
      platform,
      account_name,
      account_url: account_url || '',
      follower_count: parseInt(follower_count || '0', 10) || 0,
      notes: notes || '',
      id,
    });

    const account = db.prepare("SELECT * FROM social_account WHERE id = ?").get(id);
    await logOperation('update', 'account', id, `编辑了平台账号「${account_name}」`);
    return jsonResponse(account);
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
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM social_account WHERE id = ?").get(id);
    if (!existing) return errorResponse('账号不存在', 404);

    const ipId = (existing as Record<string, unknown>).ip_id;
    db.prepare("DELETE FROM social_account WHERE id = ?").run(id);
    db.prepare("UPDATE ip SET updated_at = datetime('now','localtime') WHERE id = ?").run(ipId);

    await logOperation('delete', 'account', id, `删除了平台账号「${(existing as Record<string, unknown>).account_name}」`);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
