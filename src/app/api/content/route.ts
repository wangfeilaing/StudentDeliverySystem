import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parsePagination } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { logOperation } from '@/lib/logger';

// 允许的来源类型
const SOURCE_TYPES = ['manual', 'douyin_profile', 'douyin_batch', 'douyin_search'];

// GET /api/content — 列表，支持来源筛选、最低点赞、关键词、排序
export async function GET(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const url = new URL(request.url);
    const source = url.searchParams.get('source') || '';
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('q') || '';
    const minDigg = parseInt(url.searchParams.get('minDigg') || '0', 10) || 0;
    const sort = url.searchParams.get('sort') || 'digg'; // digg | newest
    const { page, limit, offset } = parsePagination(request);

    let where = 'WHERE 1=1';
    const params: Record<string, string | number> = {};
    if (source && SOURCE_TYPES.includes(source)) {
      where += ' AND source_type = @source';
      params.source = source;
    }
    if (status) {
      where += ' AND status = @status';
      params.status = status;
    }
    if (minDigg > 0) {
      where += ' AND digg_count >= @minDigg';
      params.minDigg = minDigg;
    }
    if (search) {
      where += ' AND (author LIKE @s OR title LIKE @s OR original_text LIKE @s)';
      params.s = `%${search}%`;
    }

    const orderBy = sort === 'newest' ? 'created_at DESC' : 'digg_count DESC';

    const total = db.prepare(`SELECT COUNT(*) as c FROM content_items ${where}`).get(params) as { c: number };
    const items = db.prepare(
      `SELECT * FROM content_items ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset });

    // 各来源数量统计（给筛选条用）
    const counts = db.prepare(
      `SELECT source_type, COUNT(*) as c FROM content_items GROUP BY source_type`
    ).all() as Array<{ source_type: string; c: number }>;

    return jsonResponse({
      items,
      total: total.c,
      page,
      limit,
      totalPages: Math.ceil(total.c / limit),
      counts,
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

interface ImportItem {
  author?: string;
  author_url?: string;
  title?: string;
  original_text?: string;
  digg_count?: number;
  video_url?: string;
  download_url?: string;
  cover_url?: string;
  source_type?: string;
}

// POST /api/content — 批量导入文案（手动导入 / 未来采集回填都走这里）
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const body = await request.json().catch(() => ({}));
    const rawItems: ImportItem[] = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return errorResponse('没有可导入的内容', 400);

    const insert = db.prepare(
      `INSERT INTO content_items
        (source_type, platform, author, author_url, title, original_text, digg_count, video_url, download_url, cover_url, status)
       VALUES (@source_type, 'douyin', @author, @author_url, @title, @original_text, @digg_count, @video_url, @download_url, @cover_url, 'pending')`
    );

    const insertMany = db.transaction((list: ImportItem[]) => {
      let n = 0;
      for (const it of list) {
        const text = (it.original_text || '').trim();
        const title = (it.title || text.slice(0, 30) || '未命名文案').trim();
        if (!text && !title) continue;
        const source_type = SOURCE_TYPES.includes(it.source_type || '') ? it.source_type! : 'manual';
        insert.run({
          source_type,
          author: it.author || '',
          author_url: it.author_url || '',
          title,
          original_text: text,
          digg_count: Number(it.digg_count) || 0,
          video_url: it.video_url || '',
          download_url: it.download_url || '',
          cover_url: it.cover_url || '',
        });
        n++;
      }
      return n;
    });

    const inserted = insertMany(rawItems);
    await logOperation('create', 'content', null, `导入了 ${inserted} 条文案`);
    return jsonResponse({ success: true, inserted });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
