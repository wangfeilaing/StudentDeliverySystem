import { getDb } from './db';
import { getCurrentUser } from './session';

export async function logOperation(
  action: string,
  targetType: string,
  targetId: number | null,
  detail: string = ''
) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    db.prepare(`
      INSERT INTO operation_logs (user_id, username, action, target_type, target_id, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user?.id || null, user?.display_name || user?.username || 'system', action, targetType, targetId, detail);
  } catch {
    // Don't let logging failures break the application
  }
}
