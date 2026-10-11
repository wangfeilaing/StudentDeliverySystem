import { getCurrentUser } from '@/lib/session';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { cookies } from 'next/headers';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse('未登录', 401);
  const cookieStore = await cookies();
  const impersonating = !!cookieStore.get('original_session')?.value;
  return jsonResponse({ user, impersonating });
}
