import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const AUTH_BASE = 'https://open.feishu.cn/open-apis/authen/v1/authorize';

// GET /api/feishu/oauth/authorize — redirect to Feishu OAuth consent page
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get('redirect') || '/settings';

  const db = getDb();
  const appId = (db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_app_id'").get() as { value: string } | undefined)?.value;
  if (!appId) {
    const back = new URL(redirectTo, url.origin);
    back.searchParams.set('feishu_auth_error', '请先配置飞书 App ID');
    return NextResponse.redirect(back);
  }

  // Generate CSRF state
  const crypto = require('crypto');
  const state = crypto.randomBytes(16).toString('hex');

  // Persist state so we can verify in callback
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('feishu_oauth_state', ?)").run(state);

  // Build callback URL — normalize 0.0.0.0 to localhost for dev server
  const host = url.hostname === '0.0.0.0' ? 'localhost' : url.hostname;
  const callbackUrl = `${url.protocol}//${host}:${url.port}/api/feishu/oauth/callback`;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'docx:document docx:document:create wiki:wiki drive:drive',
    state,
  });

  return NextResponse.redirect(`${AUTH_BASE}?${params.toString()}`);
}
