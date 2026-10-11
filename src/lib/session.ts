import { cookies } from 'next/headers';
import { verifySessionToken } from './auth';
import { getDb } from './db';

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) return null;
  const session = verifySessionToken(sessionCookie);
  if (!session) return null;
  const db = getDb();
  return db.prepare(
    "SELECT id, username, display_name, role, avatar_path, phone FROM users WHERE id = ? AND status = 'active'"
  ).get(session.userId) as { id: number; username: string; display_name: string; role: string; avatar_path: string | null } | undefined;
}

export async function requireAuth(requiredRoles?: string[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  if (requiredRoles && !requiredRoles.includes(user.role)) throw new Error('FORBIDDEN');
  return user;
}
