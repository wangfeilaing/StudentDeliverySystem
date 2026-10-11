import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const type = url.searchParams.get('type') || 'all';

    if (!q || !q.trim()) {
      return jsonResponse({ ips: [], accounts: [], materials: [], tags: [] });
    }

    const keyword = `%${q.trim()}%`;

    let ips: unknown[] = [];
    let accounts: unknown[] = [];
    let materials: unknown[] = [];
    let tags: unknown[] = [];

    if (type === 'all' || type === 'ip') {
      ips = db.prepare(`
        SELECT id, name, category, tags, avatar_path, real_name, nickname, status
        FROM ip
        WHERE deleted_at IS NULL AND (
          name LIKE @q OR tags LIKE @q OR description LIKE @q OR category LIKE @q
          OR real_name LIKE @q OR nickname LIKE @q OR phone LIKE @q OR wechat LIKE @q
        )
        ORDER BY updated_at DESC LIMIT 20
      `).all({ q: keyword });
    }

    if (type === 'all' || type === 'account') {
      accounts = db.prepare(`
        SELECT sa.*, ip.name as ip_name, ip.id as ip_id
        FROM social_account sa
        JOIN ip ON ip.id = sa.ip_id
        WHERE ip.deleted_at IS NULL AND (
          sa.platform LIKE @q OR sa.account_name LIKE @q
        )
        ORDER BY sa.updated_at DESC LIMIT 20
      `).all({ q: keyword });
    }

    if (type === 'all' || type === 'material') {
      const screenshots = db.prepare(`
        SELECT s.id, s.title as name, 'screenshot' as type, s.file_path, s.category,
          ip.name as ip_name, ip.id as ip_id, s.file_size, s.created_at
        FROM screenshot s
        JOIN ip ON ip.id = s.ip_id
        WHERE s.deleted_at IS NULL AND (
          s.title LIKE @q OR s.category LIKE @q OR s.notes LIKE @q
          OR ip.name LIKE @q
        )
        ORDER BY s.created_at DESC LIMIT 10
      `).all({ q: keyword });

      const videos = db.prepare(`
        SELECT v.id, v.title as name, 'video' as type, v.file_path, v.category,
          ip.name as ip_name, ip.id as ip_id, v.file_size, v.created_at
        FROM video v
        JOIN ip ON ip.id = v.ip_id
        WHERE v.deleted_at IS NULL AND (
          v.title LIKE @q OR v.category LIKE @q OR v.notes LIKE @q
          OR ip.name LIKE @q
        )
        ORDER BY v.created_at DESC LIMIT 10
      `).all({ q: keyword });

      materials = [...screenshots, ...videos as unknown[]];
      materials.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
      materials = materials.slice(0, 20);
    }

    if (type === 'all' || type === 'tag') {
      tags = db.prepare(`
        SELECT id, name, color, group_name
        FROM tags
        WHERE name LIKE @q OR group_name LIKE @q
        ORDER BY name LIMIT 20
      `).all({ q: keyword });
    }

    return jsonResponse({ ips, accounts, materials, tags });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
