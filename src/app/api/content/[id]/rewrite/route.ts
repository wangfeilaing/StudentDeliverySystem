import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { rewriteText } from '@/lib/ai';
import { logOperation } from '@/lib/logger';

interface Row { id: number; original_text: string; transcript: string; }

// POST /api/content/[id]/rewrite — 用指定模型改写文案
// body: { modelId: number, instruction?: string }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const body = await request.json().catch(() => ({}));
    const modelId = Number(body.modelId);
    if (!modelId) return errorResponse('请先选择一个改写模型', 400);

    const row = db.prepare('SELECT id, original_text, transcript FROM content_items WHERE id = ?').get(id) as Row | undefined;
    if (!row) return errorResponse('内容不存在', 404);

    // 优先用转写文字，没有就用原文
    const source = (row.transcript || row.original_text || '').trim();
    if (!source) return errorResponse('这条没有可改写的文案（原文与转写都为空）', 400);

    const rewritten = await rewriteText(modelId, source, body.instruction);
    db.prepare(
      "UPDATE content_items SET rewritten_text=?, status='rewritten', updated_at=datetime('now','localtime') WHERE id=?"
    ).run(rewritten, id);

    await logOperation('rewrite', 'content', id, '完成 AI 改写');
    return jsonResponse({ success: true, rewritten });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message, 400);
  }
}
