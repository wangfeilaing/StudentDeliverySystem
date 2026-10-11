import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { getBackupStatus, runManualBackup } from '@/lib/backup';
import { logOperation } from '@/lib/logger';

/** 备份状态：是否开启自动备份、上次备份时间、现有备份列表。 */
export async function GET() {
  try {
    await requireAuth(['super_admin']);
    return jsonResponse(getBackupStatus());
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

/** 立即执行一次备份。 */
export async function POST() {
  try {
    const user = await requireAuth(['super_admin']);
    const { info, pruned } = runManualBackup();
    await logOperation('backup', 'database', null, `手动备份数据库：${info.fileName}（${(info.sizeBytes / 1024 / 1024).toFixed(1)} MB），清理旧备份 ${pruned} 个`);
    return jsonResponse({ success: true, backup: info, pruned, by: user.username });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
