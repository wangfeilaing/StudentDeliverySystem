import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parseDocumentId, getFeishuDocBlocks } from '@/lib/feishu';
import { syncFeishuToSystem } from '@/lib/feishu-sync';

// GET — Feishu event callback URL verification
export async function GET(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));

  // Feishu sends: { type: "url_verification", challenge: "xxx", token: "yyy" }
  if (body.type === 'url_verification' && body.challenge) {
    return NextResponse.json({ challenge: body.challenge });
  }

  return new NextResponse('ok');
}

// POST — receive Feishu document change events
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Handle URL verification in POST (some Feishu versions send it as POST)
    if (body.type === 'url_verification' && body.challenge) {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Handle document update event
    if (body.event?.type === 'docx.document.updated') {
      const documentId = body.event.document_id;
      if (!documentId) {
        return NextResponse.json({ code: 0 });
      }

      const db = getDb();

      // 主文档：用 ip_feishu_docs.document_id 反查最可靠（知识库链接里是节点 token，
      // 无法与回调带回来的真实 document_id 直接比对），ip.feishu_doc_url 作为兜底。
      const handled = new Set<number>();
      const docIps = db.prepare(
        "SELECT DISTINCT ip_id FROM ip_feishu_docs WHERE document_id = ?"
      ).all(documentId) as Array<{ ip_id: number }>;
      for (const row of docIps) {
        handled.add(row.ip_id);
        syncFeishuToSystem(row.ip_id, documentId).catch((e) =>
          console.error('Webhook sync error:', e)
        );
      }

      const mainIps = db.prepare(
        "SELECT id, feishu_doc_url FROM ip WHERE feishu_doc_url LIKE ?"
      ).all(`%${documentId}%`) as Array<{ id: number; feishu_doc_url: string }>;

      for (const ip of mainIps) {
        if (handled.has(ip.id)) continue;
        const parsedId = parseDocumentId(ip.feishu_doc_url);
        if (parsedId === documentId) {
          handled.add(ip.id);
          syncFeishuToSystem(ip.id, documentId).catch((e) =>
            console.error('Webhook sync error:', e)
          );
        }
      }

      // Also check ip_feishu_docs sub-documents
      const subDocs = db.prepare(
        "SELECT ip_id FROM ip_feishu_docs WHERE document_id = ?"
      ).all(documentId) as Array<{ ip_id: number }>;

      for (const doc of subDocs) {
        // Skip if already handled via main doc
        if (!handled.has(doc.ip_id)) {
          handled.add(doc.ip_id);
          syncFeishuToSystem(doc.ip_id, documentId).catch((e) =>
            console.error('Webhook sub-doc sync error:', e)
          );
        }
      }
    }

    return NextResponse.json({ code: 0 });
  } catch (e) {
    console.error('Feishu callback error:', e);
    return NextResponse.json({ code: 0 });
  }
}
