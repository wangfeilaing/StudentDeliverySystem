import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicApiPaths = ['/api/auth/login', '/api/auth/register', '/api/feishu/oauth', '/api/feishu/callback', '/api/wecom/callback', '/api/wechat-orders/callback'];

/**
 * 在 Edge Runtime 里校验会话 cookie。
 *
 * 为什么不用 @/lib/auth 的 verifySessionToken：它依赖 Node 的 crypto，
 * Edge 中间件加载不了（构建期会报 "A Node.js module is loaded ('crypto')"）。
 * 所以这里用 Web Crypto 复刻同一套算法，必须与 src/lib/auth.ts 保持一致：
 *   token   = `${userId}:${expiresMs}:${hmacSha256Hex(secret, `${userId}:${expiresMs}`)}`
 *   有效期  = 24 小时（只在签发时决定，校验只看 token 里的 expiresMs）
 * 任何一侧改动 token 结构，另一侧必须同步改，否则所有会话会被判为无效。
 */
const SESSION_SECRET = process.env.SESSION_SECRET || '';

let keyPromise: Promise<CryptoKey | null> | null = null;

function getKey(): Promise<CryptoKey | null> {
  if (!keyPromise) {
    keyPromise = (async () => {
      if (!SESSION_SECRET) return null;
      try {
        return await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(SESSION_SECRET),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
      } catch {
        return null;
      }
    })();
  }
  return keyPromise;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** 恒定时间比较，避免通过响应时间逐位猜测签名。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [userIdStr, expiresStr, signature] = parts;
  const expires = Number.parseInt(expiresStr, 10);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const key = await getKey();
  if (!key) return false;
  try {
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${userIdStr}:${expiresStr}`));
    return timingSafeEqual(toHex(mac), signature);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) return NextResponse.next();
  // 静态资源直通。注意必须排除 /api/：否则 /api/uploads/xxx.jpg 会因为后缀命中
  // 这条规则而跳过登录校验，等于把学员素材公开出去。
  if (!pathname.startsWith('/api/') && /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(pathname)) return NextResponse.next();
  if (publicApiPaths.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (pathname === '/login' || pathname === '/register') return NextResponse.next();

  // 注意：/api/uploads 不再免登录。上传的截图/视频属于学员资料，必须登录后才能读取。
  const session = request.cookies.get('session')?.value;
  if (!(await hasValidSession(session))) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const response = NextResponse.redirect(new URL('/login', request.url));
    // 顺手清掉无效/伪造的 cookie，避免浏览器一直带着它
    if (session) response.cookies.set('session', '', { path: '/', expires: new Date(0) });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
