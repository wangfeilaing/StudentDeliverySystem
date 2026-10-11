import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { getWechatStoreCredentials, saveWechatStoreCredentials } from '@/lib/wechat-store';

// GET /api/settings/wechat-store — get current credentials (secret masked)
export async function GET() {
  try {
    await requireAuth(['super_admin', 'admin']);
    const creds = getWechatStoreCredentials();
    return jsonResponse({
      appid: creds?.appid || '',
      hasSecret: !!creds?.appsecret,
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}

// POST /api/settings/wechat-store — save credentials
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const body = await request.json();
    const { appid, appsecret } = body;
    if (!appid || !appsecret) return errorResponse('AppID 和 AppSecret 不能为空', 400);
    saveWechatStoreCredentials(appid, appsecret);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
