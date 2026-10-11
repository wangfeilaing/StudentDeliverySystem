import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { collectDouyin } from '@/lib/douyin';
import { logOperation } from '@/lib/logger';

const MODES = ['douyin_profile', 'douyin_batch', 'douyin_search'];

// POST /api/content/collect — 抖音采集（真实浏览器抓取，按点赞过滤后入库）
// body: { mode, keyword, minDigg, maxItems? }
// 注意：首次运行会弹出浏览器窗口要求扫码登录，需在有桌面环境的机器上运行。
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const body = await request.json().catch(() => ({}));
    const mode = MODES.includes(body.mode) ? body.mode : 'douyin_profile';
    const keyword = String(body.keyword || '').trim();
    const minDigg = Number(body.minDigg) || 0;
    const maxItems = Math.min(200, Number(body.maxItems) || 60);
    if (!keyword) return errorResponse(mode === 'douyin_search' ? '请填写搜索关键词' : '请填写博主主页链接', 400);

    const items = await collectDouyin({ mode, keyword, minDigg, maxItems });

    if (items.length === 0) {
      return jsonResponse({ success: true, inserted: 0, skipped: 0, message: '没有采集到符合条件的内容（可能未登录、被验证拦截，或点赞阈值过高）。' });
    }

    const db = getDb();
    // 用 aweme_id 去重：已存在的视频链接不重复入库
    const existing = new Set(
      (db.prepare('SELECT video_url FROM content_items').all() as Array<{ video_url: string }>).map(r => r.video_url)
    );
    const insert = db.prepare(
      `INSERT INTO content_items
        (source_type, platform, author, author_url, title, original_text, digg_count, comment_count, share_count, video_url, cover_url, status)
       VALUES (@source_type, 'douyin', @author, @author_url, @title, @original_text, @digg_count, @comment_count, @share_count, @video_url, @cover_url, 'pending')`
    );
    let inserted = 0, skipped = 0;
    const tx = db.transaction((list: typeof items) => {
      for (const it of list) {
        if (it.video_url && existing.has(it.video_url)) { skipped++; continue; }
        insert.run({ source_type: mode, ...it });
        inserted++;
      }
    });
    tx(items);

    await logOperation('collect', 'content', null, `抖音采集入库 ${inserted} 条（${mode}）`);
    return jsonResponse({ success: true, inserted, skipped, message: `采集完成：新增 ${inserted} 条${skipped ? `，跳过重复 ${skipped} 条` : ''}` });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse(`采集失败：${(e as Error).message}`, 400);
  }
}
