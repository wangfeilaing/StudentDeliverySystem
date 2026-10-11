import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const originalSession = cookieStore.get('original_session')?.value;
    if (!originalSession) return errorResponse('没有可恢复的原始账号', 400);

    // Restore original session
    cookieStore.set('session', originalSession, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      path: '/',
    });

    // Clear original_session cookie
    cookieStore.set('original_session', '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      expires: new Date(0),
      path: '/',
    });

    return jsonResponse({ success: true });
  } catch {
    return errorResponse('操作失败', 500);
  }
}
