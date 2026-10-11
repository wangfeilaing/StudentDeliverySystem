import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { storeUserTokens, getFeishuCredentials } from '@/lib/feishu';

// GET /api/feishu/oauth/callback — Feishu redirects here with ?code=xxx&state=xxx
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const db = getDb();
  const storedState = (db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_oauth_state'").get() as { value: string } | undefined)?.value;

  if (!code) {
    return NextResponse.redirect(new URL('/settings?feishu_auth_error=授权被取消', url.origin));
  }
  if (!state || state !== storedState) {
    return NextResponse.redirect(new URL('/settings?feishu_auth_error=安全校验失败', url.origin));
  }

  // Clean up state
  db.prepare("DELETE FROM system_settings WHERE key = 'feishu_oauth_state'").run();

  // Get app credentials for token exchange
  const creds = getFeishuCredentials();
  if (!creds) {
    return NextResponse.redirect(new URL('/settings?feishu_auth_error=未配置飞书应用凭证', url.origin));
  }

  // Build callback URL for verification
  const host = url.hostname === '0.0.0.0' ? 'localhost' : url.hostname;
  const redirectUri = `${url.protocol}//${host}:${url.port}/api/feishu/oauth/callback`;

  // Exchange code for tokens
  try {
    const tokenRes = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        app_id: creds.app_id,
        app_secret: creds.app_secret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.code !== 0 || !tokenData.data) {
      console.error('Feishu OAuth token exchange failed:', tokenData);
      return NextResponse.redirect(new URL('/settings?feishu_auth_error=授权失败，请重试', url.origin));
    }

    const { access_token, refresh_token, expires_in } = tokenData.data;
    if (!access_token) {
      return NextResponse.redirect(new URL('/settings?feishu_auth_error=未获取到访问凭证', url.origin));
    }

    storeUserTokens(access_token, refresh_token || '', expires_in || 7200);

    return NextResponse.redirect(new URL('/settings?feishu_auth_success=1', url.origin));
  } catch (e) {
    console.error('Feishu OAuth callback error:', e);
    return NextResponse.redirect(new URL('/settings?feishu_auth_error=网络错误', url.origin));
  }
}
