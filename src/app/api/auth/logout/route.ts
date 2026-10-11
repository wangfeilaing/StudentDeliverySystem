import { jsonResponse } from '@/lib/api-helpers';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set('session', '', { httpOnly: true, secure: false, sameSite: 'lax', expires: new Date(0), path: '/' });
  return jsonResponse({ success: true });
}
