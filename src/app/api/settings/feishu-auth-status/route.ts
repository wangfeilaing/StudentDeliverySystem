import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { probeUserToken } from '@/lib/feishu';

/**
 * 飞书授权状态。会真正尝试换取一次 access_token，
 * 而不是只检查「过期时间字段还在不在」——后者会在令牌实际失效时
 * 仍然返回「已授权」，让所有飞书功能在页面上显示正常、实际全部失败。
 */
export async function GET() {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const probe = await probeUserToken();
    return jsonResponse({
      authorized: probe.usable,
      expiresAt: probe.expiresAt,
      state: probe.state,
      message: probe.message,
      needsReauth: probe.needsReauth,
      hasRefreshToken: probe.hasRefreshToken,
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
