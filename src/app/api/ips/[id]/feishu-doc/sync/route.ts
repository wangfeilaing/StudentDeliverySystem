import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { resolveDocxId } from '@/lib/feishu';
import { syncFeishuToSystem, syncSystemToFeishu } from '@/lib/feishu-sync';

// POST /api/ips/[id]/feishu-doc/sync
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const ipId = parseId(await params);

    const ip = db.prepare("SELECT id, feishu_doc_url FROM ip WHERE id = ?").get(ipId) as { id: number; feishu_doc_url: string } | undefined;
    if (!ip) return errorResponse('IP 不存在', 404);
    if (!ip.feishu_doc_url) return errorResponse('尚未创建飞书文档', 400);

    const body = await request.json().catch(() => ({}));
    const direction = body.direction || 'pull';

    // Resolve document_id — use requested one or fall back to main doc
    let targetDocUrl = ip.feishu_doc_url;
    let storedDocumentId: string | null = null;
    if (body.document_id) {
      const doc = db.prepare(
        "SELECT feishu_doc_url, document_id FROM ip_feishu_docs WHERE document_id = ? AND ip_id = ?"
      ).get(body.document_id, ipId) as { feishu_doc_url: string; document_id: string } | undefined;
      if (doc?.feishu_doc_url) targetDocUrl = doc.feishu_doc_url;
      storedDocumentId = doc?.document_id || body.document_id;
    }
    if (!storedDocumentId) {
      // wiki 链接里是知识库节点 token，必须用库里记录的 document_id
      const match = db.prepare(
        "SELECT document_id FROM ip_feishu_docs WHERE ip_id = ? AND feishu_doc_url = ? LIMIT 1"
      ).get(ipId, targetDocUrl) as { document_id: string } | undefined;
      storedDocumentId = match?.document_id || null;
    }

    const documentId = resolveDocxId(targetDocUrl, storedDocumentId);
    if (!documentId) return errorResponse('无法解析飞书文档链接（知识库链接需要先建立文档映射）', 400);

    if (direction === 'pull') {
      const result = await syncFeishuToSystem(ipId, documentId, user.id);
      return jsonResponse({
        success: result.success,
        direction: 'pull',
        changesDetected: result.changesDetected,
        changesApplied: result.changesApplied,
        details: result.details,
        error: result.error,
      });
    }

    if (direction === 'push') {
      const result = await syncSystemToFeishu(ipId, documentId, user.id);
      return jsonResponse({
        success: result.success,
        direction: 'push',
        changesDetected: result.changesDetected,
        changesApplied: result.changesApplied,
        details: result.details,
        error: result.error,
      });
    }

    return errorResponse('无效的同步方向', 400);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
