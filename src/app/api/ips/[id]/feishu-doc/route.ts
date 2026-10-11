import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import {
  parseDocumentId, resolveDocxId, getFeishuDocBlocks, blocksToSections, blocksToSectionsMarkdown, blocksToMarkdown,
  updateFeishuDocBlock, updateFeishuDocBlockFormatted, createFeishuDoc, generate19800Template,
  createDeliveryDocSet, DELIVERY_TEMPLATES, probeUserToken, hasTenantAccess,
} from '@/lib/feishu';
import { buildBlockMappings, syncSystemToFeishu } from '@/lib/feishu-sync';

// GET /api/ips/[id]/feishu-doc — pull Feishu doc content, grouped by stage (H1)
// Query params: ?document_id=xxx (optional, uses main doc if omitted)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const ipId = parseId(await params);

    const ip = db.prepare("SELECT id, name, feishu_doc_url FROM ip WHERE id = ?").get(ipId) as { id: number; name: string; feishu_doc_url: string } | undefined;
    if (!ip) return errorResponse('IP 不存在', 404);

    const url = new URL(request.url);
    const requestedDocId = url.searchParams.get('document_id') || '';

    const allDocs = db.prepare(
      "SELECT document_name, feishu_doc_url, document_id, obj_type, sort_order FROM ip_feishu_docs WHERE ip_id = ? ORDER BY sort_order"
    ).all(ipId) as Array<{ document_name: string; feishu_doc_url: string; document_id: string; obj_type: string; sort_order: number }>;

    // Determine which document to fetch
    let targetUrl: string | null = null;
    let storedDocumentId: string | null = null;
    if (requestedDocId) {
      const doc = allDocs.find(d => d.document_id === requestedDocId);
      targetUrl = doc?.feishu_doc_url || null;
      storedDocumentId = doc?.document_id || requestedDocId;
      // Fallback: try using the doc's own feishu_doc_url column
      if (!targetUrl) {
        const altDoc = db.prepare(
          "SELECT feishu_doc_url, document_id FROM ip_feishu_docs WHERE document_id = ? AND ip_id = ?"
        ).get(requestedDocId, ipId) as { feishu_doc_url: string; document_id: string } | undefined;
        targetUrl = altDoc?.feishu_doc_url || null;
        storedDocumentId = altDoc?.document_id || requestedDocId;
      }
    } else {
      targetUrl = ip.feishu_doc_url;
      if (!targetUrl && allDocs.length > 0) {
        // ip.feishu_doc_url 为空时回退到第一篇文档，避免"有文档却显示空"
        targetUrl = allDocs[0].feishu_doc_url;
        storedDocumentId = allDocs[0].document_id;
      } else if (targetUrl) {
        const match = allDocs.find(d => d.feishu_doc_url === targetUrl);
        storedDocumentId = match?.document_id || null;
      }
    }

    if (!targetUrl) return jsonResponse({ docUrl: null, sections: [], markdown: '', blocks: [], docs: allDocs, feishu: { usable: true, state: 'ok', message: '该 IP 还没有关联飞书文档。' } });

    // 关键：wiki 链接里的是知识库节点 token，不是 docx 文档 ID，
    // 必须优先使用库里记录的 document_id，否则会读回 0 个块（页面显示空文档）。
    const documentId = resolveDocxId(targetUrl, storedDocumentId);
    let sections: Array<{ heading: string; content: string; blockId: string }> = [];
    let sectionsMarkdown: Array<{ heading: string; markdown: string; blockId: string }> = [];
    let markdown = '';
    let blocks: import('@/lib/feishu').FeishuBlockItem[] = [];

    if (documentId) {
      blocks = await getFeishuDocBlocks(documentId);

      // 「文档存在但读回 0 个块」不是一个正常结果，必须区分原因，
      // 否则用户看到的是一份空白文档，会以为是文档没内容。
      if (blocks.length === 0) {
        const probe = await probeUserToken();
        const tenantOk = await hasTenantAccess();
        const message = !tenantOk
          ? '飞书应用凭证无效或应用已停用，无法读取文档。请检查系统设置里的 App ID / App Secret。'
          : !probe.usable
            ? `${probe.message}（文档读取依赖飞书授权，请重新授权后再试。）`
            : '飞书返回了 0 个文档块：可能是文档为空，或该应用没有这篇文档的阅读权限。';
        return errorResponse(message, 503);
      }

      sections = blocksToSections(blocks);
      sectionsMarkdown = blocksToSectionsMarkdown(blocks);
      markdown = blocksToMarkdown(blocks);
    }

    return jsonResponse({
      docUrl: targetUrl,
      sections,
      sectionsMarkdown,
      markdown,
      blocks: blocks.map(b => ({ block_id: b.block_id, block_type: b.block_type })),
      docs: allDocs,
    });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

// PUT /api/ips/[id]/feishu-doc — update a block or sync content
// Body: { action: 'update_block', blockId: string, content: string }
//    or { action: 'create_doc' }
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const ipId = parseId(await params);
    const body = await request.json();

    const ip = db.prepare("SELECT id, name, feishu_doc_url FROM ip WHERE id = ?").get(ipId) as { id: number; name: string; feishu_doc_url: string } | undefined;
    if (!ip) return errorResponse('IP 不存在', 404);

    // Update a single block
    if (body.action === 'update_block') {
      let docRow: { feishu_doc_url: string; document_id: string } | undefined;
      if (body.document_id) {
        docRow = db.prepare("SELECT feishu_doc_url, document_id FROM ip_feishu_docs WHERE document_id = ? AND ip_id = ?")
          .get(body.document_id, ipId) as { feishu_doc_url: string; document_id: string } | undefined;
      } else if (ip.feishu_doc_url) {
        docRow = db.prepare("SELECT feishu_doc_url, document_id FROM ip_feishu_docs WHERE ip_id = ? AND feishu_doc_url = ? LIMIT 1")
          .get(ipId, ip.feishu_doc_url) as { feishu_doc_url: string; document_id: string } | undefined;
      }
      const targetDocUrl = docRow?.feishu_doc_url || ip.feishu_doc_url;

      if (!targetDocUrl) return errorResponse('尚未创建飞书文档', 400);
      // 知识库链接里是节点 token，优先用库里记录的 document_id
      const documentId = resolveDocxId(targetDocUrl, docRow?.document_id);
      if (!documentId) return errorResponse('无法解析飞书文档链接', 400);

      const ok = await updateFeishuDocBlockFormatted(documentId, body.blockId, body.content || '');
      if (ok) {
        // Update content_hash in mappings
        const crypto = require('crypto');
        const newHash = crypto.createHash('sha256').update(body.content || '').digest('hex');
        db.prepare(
          "UPDATE feishu_block_mappings SET content_hash = ?, last_synced_at = datetime('now') WHERE document_id = ? AND block_id = ?"
        ).run(newHash, documentId, body.blockId);

        // Write sync log
        db.prepare(
          `INSERT INTO feishu_sync_log (ip_id, document_id, direction, trigger, changes_detected, changes_applied, details, status)
           VALUES (?, ?, 'system_to_feishu', 'manual', 1, 1, ?, 'success')`
        ).run(ipId, documentId, JSON.stringify([{ blockId: body.blockId, changeType: 'content_edited', description: '用户在系统中编辑了文档内容' }]));
      }
      return jsonResponse({ success: ok });
    }

    // Create all delivery docs (batch for 19800)
    if (body.action === 'create_doc') {
      // Check if already created (new batch format)
      const existingDocs = db.prepare(
        "SELECT COUNT(*) as cnt FROM ip_feishu_docs WHERE ip_id = ?"
      ).get(ipId) as { cnt: number };

      if (existingDocs.cnt > 0) {
        const docs = db.prepare(
          "SELECT feishu_doc_url FROM ip_feishu_docs WHERE ip_id = ? ORDER BY sort_order LIMIT 1"
        ).get(ipId) as { feishu_doc_url: string } | undefined;
        return jsonResponse({ docUrl: docs?.feishu_doc_url || ip.feishu_doc_url, alreadyCreated: true });
      }

      // If old-format single doc exists, skip to avoid duplicates
      if (ip.feishu_doc_url && existingDocs.cnt === 0) {
        return jsonResponse({ docUrl: ip.feishu_doc_url, alreadyCreated: true });
      }

      // Check if this is a 19800 product
      const is19800 = (db.prepare("SELECT product_type_id FROM ip WHERE id = ?").get(ipId) as { product_type_id: number | null } | undefined)?.product_type_id === 2;

      if (is19800) {
        // Batch create all 9 documents
        const results = await createDeliveryDocSet(ip.name);
        const insertDoc = db.prepare(
          "INSERT INTO ip_feishu_docs (ip_id, document_name, feishu_doc_url, document_id, obj_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
        );
        let firstUrl = '';
        for (const r of results) {
          if (r.url) {
            const sortOrder = DELIVERY_TEMPLATES.find(t => t.name === r.name)?.sortOrder || 0;
            insertDoc.run(ipId, r.name, r.url, r.documentId, r.objType, sortOrder);
            if (r.name === '交付流程总览') firstUrl = r.url;
          }
        }
        if (firstUrl) {
          db.prepare("UPDATE ip SET feishu_doc_url = ? WHERE id = ?").run(firstUrl, ipId);
        }
        const errors = results.filter(r => r.error);
        return jsonResponse({
          docUrl: firstUrl || undefined,
          docs: results,
          warning: errors.length > 0 ? `${errors.length} 个文档创建失败` : undefined,
        });
      }

      // Fallback: single doc creation (non-19800 products)
      const wikiToken = (db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_folder_token'").get() as { value: string } | undefined)?.value || undefined;
      const templateBlocks = generate19800Template(ip.name);
      const result = await createFeishuDoc(
        `【${ip.name}】高客单IP破局起飞计划 - 交付文档`,
        templateBlocks,
        wikiToken,
      );
      if (!result) return errorResponse('创建飞书文档失败，请检查飞书应用凭证', 500);

      db.prepare("UPDATE ip SET feishu_doc_url = ? WHERE id = ?").run(result.url, ipId);

      // Auto-build block mappings after doc creation
      try {
        const docBlocks = await getFeishuDocBlocks(result.document_id);
        if (docBlocks.length > 0) {
          buildBlockMappings(ipId, result.document_id, docBlocks);
        }
      } catch (e) {
        console.error('Failed to build block mappings after doc creation:', e);
      }

      return jsonResponse({ docUrl: result.url, warning: result.warning || undefined });
    }

    // Build mappings for an existing doc
    if (body.action === 'map_existing') {
      if (!ip.feishu_doc_url) return errorResponse('尚未创建飞书文档', 400);
      const stored = db.prepare(
        "SELECT document_id FROM ip_feishu_docs WHERE ip_id = ? AND feishu_doc_url = ? LIMIT 1"
      ).get(ipId, ip.feishu_doc_url) as { document_id: string } | undefined;
      const documentId = resolveDocxId(ip.feishu_doc_url, stored?.document_id);
      if (!documentId) return errorResponse('无法解析飞书文档链接（知识库链接需要先建立文档映射）', 400);

      const blocks = await getFeishuDocBlocks(documentId);
      if (!blocks.length) {
        const tenantOk = await hasTenantAccess();
        return errorResponse(
          tenantOk
            ? '无法获取飞书文档内容：文档可能为空，或应用没有该文档的阅读权限'
            : '无法获取飞书文档内容：飞书应用凭证无效，请检查 App ID / App Secret',
          502,
        );
      }

      const count = buildBlockMappings(ipId, documentId, blocks);
      return jsonResponse({ success: true, mappedBlocks: count });
    }

    return errorResponse('无效的 action', 400);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
