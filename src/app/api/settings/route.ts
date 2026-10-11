import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { encryptFeishuSecret } from '@/lib/feishu';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function GET() {
  try {
    await requireAuth(['super_admin']);
    const db = getDb();

    const settings = db.prepare("SELECT * FROM system_settings").all() as Array<{ key: string; value: string }>;
    const settingsMap: Record<string, string> = {};
    settings.forEach(s => {
      if (s.key === 'feishu_app_secret' && s.value) {
        settingsMap[s.key] = '••••••••';
      } else {
        settingsMap[s.key] = s.value;
      }
    });

    // DB stats
    const dbStat = fs.statSync(path.join(DATA_DIR, 'app.db'));
    const totalIPs = (db.prepare("SELECT COUNT(*) as c FROM ip WHERE deleted_at IS NULL").get() as { c: number }).c;
    const totalMaterials = (db.prepare("SELECT COUNT(*) as c FROM screenshot WHERE deleted_at IS NULL").get() as { c: number }).c +
      (db.prepare("SELECT COUNT(*) as c FROM video WHERE deleted_at IS NULL").get() as { c: number }).c;
    const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;

    return jsonResponse({
      settings: settingsMap,
      stats: {
        dbSizeMB: (dbStat.size / (1024 * 1024)).toFixed(1),
        totalIPs,
        totalMaterials,
        totalUsers,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAuth(['super_admin']);
    const db = getDb();
    const { settings } = await request.json();

    const upsert = db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))");
    for (const [key, value] of Object.entries(settings)) {
      let storedValue = String(value ?? '');
      if (key === 'feishu_app_secret') {
        if (!storedValue || storedValue === '••••••••') continue;
        storedValue = encryptFeishuSecret(storedValue);
      }
      upsert.run(key, storedValue);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
