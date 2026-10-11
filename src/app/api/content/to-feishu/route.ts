import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';
import { createFeishuDoc } from '@/lib/feishu';

interface ContentRow {
  id: number;
  author: string;
  title: string;
  original_text: string;
  rewritten_text: string;
  transcript: string;
  digg_count: number;
  video_url: string;
}

// 把一条文案转成飞书文档块：H2 标题 + 正文段落 + 分割线
function itemToBlocks(item: ContentRow): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const heading = `${item.author ? `【${item.author}】` : ''}${item.title || '未命名文案'}${item.digg_count ? `  ♥${item.digg_count}` : ''}`;
  blocks.push({
    block_type: 4, // heading2
    heading2: { elements: [{ text_run: { content: heading } }], style: {} },
  });
  // 优先用改写后文案，没有就用转写，再没有就用原文
  const body = item.rewritten_text || item.transcript || item.original_text || '';
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    blocks.push({
      block_type: 2, // text
      text: { elements: [{ text_run: { content: line } }], style: {} },
    });
  }
  blocks.push({ block_type: 22, divider: {} }); // 分割线
  return blocks;
}

// POST /api/content/to-feishu — 把选中的文案写入一篇飞书文档（自动排版）
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const body = await request.json().catch(() => ({}));
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
    if (ids.length === 0) return errorResponse('请先选择要写入飞书的文案', 400);

    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT id, author, title, original_text, rewritten_text, transcript, digg_count, video_url
       FROM content_items WHERE id IN (${placeholders}) ORDER BY digg_count DESC`
    ).all(...ids) as ContentRow[];
    if (rows.length === 0) return errorResponse('选中的文案不存在', 404);

    const title = (body.docTitle && String(body.docTitle).trim())
      || `内容工坊导出 ${new Date().toLocaleString('zh-CN')}（${rows.length}条）`;

    const children: Array<Record<string, unknown>> = [];
    for (const row of rows) children.push(...itemToBlocks(row));

    const result = await createFeishuDoc(title, children);
    if (!result) {
      return errorResponse('写入飞书失败：请先在「系统设置」里配置并授权飞书。', 400);
    }

    // 回写状态与文档链接
    const update = db.prepare(
      "UPDATE content_items SET status='exported', feishu_doc_url=?, updated_at=datetime('now','localtime') WHERE id=?"
    );
    const updateMany = db.transaction((list: ContentRow[]) => {
      for (const r of list) update.run(result.url, r.id);
    });
    updateMany(rows);

    await logOperation('export', 'content', null, `导出 ${rows.length} 条文案到飞书`);
    return jsonResponse({ success: true, url: result.url, count: rows.length });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
