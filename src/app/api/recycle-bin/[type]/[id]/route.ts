import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';
import { deleteFile } from '@/lib/storage';

/**
 * 彻底删除会连带清掉某个 IP 名下的一整套交付档案：
 * 交付任务、交付日志、飞书文档、任务附件、阶段进度。
 *
 * 原先的实现只删截图/视频/账号/ip，其余全靠数据库的 ON DELETE CASCADE 静默删除，
 * 而物理文件又不会删除（磁盘只涨不减）。这里改成：
 *   1) 先用 ?impact=1 把「将要删掉多少东西」返回给调用方确认；
 *   2) 真正删除时显式列出每一张关联表（不再依赖隐式 CASCADE），并在事务里执行；
 *   3) 同时清理 uploads 下属于该 IP 的物理文件。
 */

type Counts = Record<string, number>;

// 注意列名：交付相关的三张表用 client_id 指向 ip(id)，其余用 ip_id。
// 列名写错会被 catch 静默吞掉，导致「影响面预览」少报，因此这里显式声明。
const IP_CHILD_TABLES: Array<{ table: string; column: string; label: string }> = [
  { table: 'client_delivery_tasks', column: 'client_id', label: '交付任务' },
  { table: 'delivery_logs', column: 'client_id', label: '交付日志' },
  { table: 'task_attachments', column: 'client_id', label: '任务附件' },
  { table: 'ip_feishu_docs', column: 'ip_id', label: '飞书文档' },
  { table: 'ip_stage_progress', column: 'ip_id', label: '阶段进度' },
  { table: 'feishu_block_mappings', column: 'ip_id', label: '飞书块映射' },
  { table: 'feishu_sync_log', column: 'ip_id', label: '飞书同步日志' },
  { table: 'social_account', column: 'ip_id', label: '平台账号' },
  { table: 'screenshot', column: 'ip_id', label: '截图' },
  { table: 'video', column: 'ip_id', label: '视频' },
  { table: 'feedbacks', column: 'ip_id', label: '好评反馈' },
  { table: 'success_cases', column: 'ip_id', label: '爆款案例' },
  { table: 'ip_tags', column: 'ip_id', label: '标签关联' },
];

function countIpChildren(db: ReturnType<typeof getDb>, ipId: number): { counts: Counts; filePaths: string[] } {
  const counts: Counts = {};
  for (const { table, column, label } of IP_CHILD_TABLES) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} = ?`).get(ipId) as { c: number } | undefined;
      if (row && row.c > 0) counts[label] = row.c;
    } catch (e) {
      // 不能静默：统计漏报会让用户在不知情的情况下删掉整份交付档案
      console.error(`[recycle-bin] 统计 ${table} 失败（列 ${column}）：`, (e as Error).message);
      counts[`${label}(统计失败)`] = -1;
    }
  }

  // 文件清理清单：截图/视频的主体与缩略图、任务附件
  const filePaths: string[] = [];
  const pushAll = (rows: Array<Record<string, unknown>>, keys: string[]) => {
    for (const row of rows) {
      for (const k of keys) {
        const v = row[k];
        if (typeof v === 'string' && v) filePaths.push(v);
      }
    }
  };
  try {
    pushAll(db.prepare('SELECT file_path FROM screenshot WHERE ip_id = ?').all(ipId) as Array<Record<string, unknown>>, ['file_path']);
    pushAll(db.prepare('SELECT file_path, thumbnail_path FROM video WHERE ip_id = ?').all(ipId) as Array<Record<string, unknown>>, ['file_path', 'thumbnail_path']);
    pushAll(db.prepare('SELECT file_path FROM task_attachments WHERE client_id = ?').all(ipId) as Array<Record<string, unknown>>, ['file_path']);
  } catch (e) {
    console.error('[recycle-bin] 收集待删除文件失败：', (e as Error).message);
  }
  return { counts, filePaths };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const { type, id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) return errorResponse('无效 ID', 400);

    if (type !== 'ip') {
      return jsonResponse({ type, id, impact: {} });
    }

    const ip = db.prepare('SELECT id, name FROM ip WHERE id = ?').get(id) as { id: number; name: string } | undefined;
    if (!ip) return errorResponse('IP 不存在', 404);

    const { counts, filePaths } = countIpChildren(db, id);
    return jsonResponse({
      type: 'ip',
      id,
      name: ip.name,
      impact: counts,
      fileCount: filePaths.length,
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

// Restore
export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const { type, id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) return errorResponse('无效 ID', 400);

    if (type === 'screenshot') {
      db.prepare("UPDATE screenshot SET deleted_at = NULL WHERE id = ?").run(id);
    } else if (type === 'video') {
      db.prepare("UPDATE video SET deleted_at = NULL WHERE id = ?").run(id);
    } else if (type === 'ip') {
      db.prepare("UPDATE ip SET deleted_at = NULL WHERE id = ?").run(id);
      db.prepare("UPDATE screenshot SET deleted_at = NULL WHERE ip_id = ? AND deleted_at IS NOT NULL").run(id);
      db.prepare("UPDATE video SET deleted_at = NULL WHERE ip_id = ? AND deleted_at IS NOT NULL").run(id);
    } else {
      return errorResponse('不支持的类型', 400);
    }

    await logOperation('restore', type, id, `恢复了${type}`);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

// Permanently delete
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    await requireAuth(['super_admin']);
    const db = getDb();
    const { type, id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) return errorResponse('无效 ID', 400);

    // 两步确认：不带 confirm=1 时只回报影响面，不执行删除
    const url = new URL(request.url);
    const confirmed = url.searchParams.get('confirm') === '1';
    if (!confirmed) {
      const preview = type === 'ip' ? countIpChildren(db, id) : null;
      return jsonResponse(
        {
          needConfirm: true,
          type,
          id,
          impact: preview ? preview.counts : {},
          fileCount: preview ? preview.filePaths.length : 1,
          message: '这是不可撤销的彻底删除。请带上 confirm=1 重新发起请求以执行。',
        },
        409,
      );
    }

    let removedFiles = 0;
    let detail = '';

    if (type === 'screenshot') {
      const item = db.prepare("SELECT file_path FROM screenshot WHERE id = ?").get(id) as { file_path: string } | undefined;
      if (!item) return errorResponse('记录不存在', 404);
      if (item.file_path) { deleteFile(item.file_path); removedFiles++; }
      db.prepare("DELETE FROM screenshot WHERE id = ?").run(id);
    } else if (type === 'video') {
      const item = db.prepare("SELECT file_path, thumbnail_path FROM video WHERE id = ?").get(id) as { file_path: string; thumbnail_path: string | null } | undefined;
      if (!item) return errorResponse('记录不存在', 404);
      if (item.file_path) { deleteFile(item.file_path); removedFiles++; }
      if (item.thumbnail_path) { deleteFile(item.thumbnail_path); removedFiles++; }
      db.prepare("DELETE FROM video WHERE id = ?").run(id);
    } else if (type === 'ip') {
      const ip = db.prepare('SELECT id, name FROM ip WHERE id = ?').get(id) as { id: number; name: string } | undefined;
      if (!ip) return errorResponse('IP 不存在', 404);

      const { counts, filePaths } = countIpChildren(db, id);

      // 显式列出每一张关联表，顺序放在一个事务里；不再依赖隐式的 ON DELETE CASCADE
      const purge = db.transaction((ipId: number) => {
        db.prepare('DELETE FROM task_attachments WHERE client_id = ?').run(ipId);
        db.prepare('DELETE FROM delivery_logs WHERE client_id = ?').run(ipId);
        db.prepare('DELETE FROM client_delivery_tasks WHERE client_id = ?').run(ipId);
        db.prepare('DELETE FROM ip_feishu_docs WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM ip_stage_progress WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM feishu_block_mappings WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM feishu_sync_log WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM feedbacks WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM success_cases WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM ip_tags WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM material_tags WHERE material_type = ? AND material_id IN (SELECT id FROM screenshot WHERE ip_id = ?)').run('screenshot', ipId);
        db.prepare('DELETE FROM screenshot WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM video WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM social_account WHERE ip_id = ?').run(ipId);
        db.prepare('DELETE FROM ip WHERE id = ?').run(ipId);
      });
      purge(id);

      // 数据库删干净后再删物理文件，失败也不影响数据一致性
      for (const f of filePaths) {
        try { deleteFile(f); removedFiles++; } catch { /* 文件不存在时忽略 */ }
      }
      detail = `；连带清除 ${Object.entries(counts).map(([k, v]) => `${k}${v}条`).join('、') || '无关联记录'}`;
    } else {
      return errorResponse('不支持的类型', 400);
    }

    await logOperation('permanent_delete', type, id, `彻底删除了${type}${detail}；清理文件 ${removedFiles} 个`);
    return jsonResponse({ success: true, removedFiles, detail });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
