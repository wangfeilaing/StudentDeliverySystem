import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { listNotifications, unreadCount, markRead, markAllRead } from '@/lib/notifications';

// GET /api/notifications — 列表 + 未读数
export async function GET() {
  try {
    await requireAuth(['super_admin', 'admin', 'operator', 'business']);
    return jsonResponse({ items: listNotifications(50), unread: unreadCount() });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}

// PATCH /api/notifications — 标记已读。body: { all: true } 或 { ids: number[] }
export async function PATCH(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator', 'business']);
    const body = await request.json().catch(() => ({}));
    if (body.all) {
      markAllRead();
    } else if (Array.isArray(body.ids)) {
      markRead(body.ids.filter((n: unknown) => typeof n === 'number'));
    }
    return jsonResponse({ success: true, unread: unreadCount() });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
