import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const id = parseId(await params);
    const accounts = db.prepare(
      "SELECT * FROM social_account WHERE ip_id = ? ORDER BY created_at DESC"
    ).all(id);
    return jsonResponse(accounts);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM ip WHERE id = ?").get(id);
    if (!existing) return errorResponse('IP 不存在', 404);

    const data = await request.json();
    const { platform, account_name, account_url, follower_count, notes } = data;

    if (!platform || !account_name) {
      return errorResponse('平台和账号名不能为空', 400);
    }

    const result = db.prepare(`
      INSERT INTO social_account (ip_id, platform, account_name, account_url, follower_count, notes)
      VALUES (@ip_id, @platform, @account_name, @account_url, @follower_count, @notes)
    `).run({
      ip_id: id,
      platform,
      account_name,
      account_url: account_url || '',
      follower_count: parseInt(follower_count || '0', 10) || 0,
      notes: notes || '',
    });

    // Update IP's updated_at
    db.prepare("UPDATE ip SET updated_at = datetime('now','localtime') WHERE id = ?").run(id);

    const account = db.prepare("SELECT * FROM social_account WHERE id = ?").get(result.lastInsertRowid);
    await logOperation('create', 'account', id, `新增平台账号「${account_name}」`);
    return jsonResponse(account, 201);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
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
    const existing = db.prepare("SELECT id FROM ip WHERE id = ?").get(id);
    if (!existing) return errorResponse('IP 不存在', 404);

    const data = await request.json();
    const accounts = data.accounts as Array<{
      id?: number; platform: string; account_name: string;
      account_url?: string; follower_count?: number; notes?: string;
    }>;

    if (!Array.isArray(accounts)) return errorResponse('accounts 必须为数组', 400);

    // Replace all accounts: delete existing, insert new
    const deleteStmt = db.prepare("DELETE FROM social_account WHERE ip_id = ?");
    const insertStmt = db.prepare(
      "INSERT INTO social_account (ip_id, platform, account_name, account_url, follower_count, notes) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const transaction = db.transaction(() => {
      deleteStmt.run(id);
      for (const a of accounts) {
        if (!a.platform || !a.account_name) continue;
        insertStmt.run(
          id, a.platform, a.account_name,
          a.account_url || '', a.follower_count || 0, a.notes || ''
        );
      }
      db.prepare("UPDATE ip SET updated_at = datetime('now','localtime') WHERE id = ?").run(id);
    });

    transaction();

    const updated = db.prepare("SELECT * FROM social_account WHERE ip_id = ? ORDER BY created_at DESC").all(id);
    await logOperation('update', 'account', id, `更新了平台账号列表（共 ${accounts.length} 个）`);
    return jsonResponse(updated);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
