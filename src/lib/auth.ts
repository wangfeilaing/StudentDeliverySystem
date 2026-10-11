import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verify));
}

export function createSessionToken(userId: number): { token: string; expires: Date } {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const payload = `${userId}:${expires.getTime()}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return { token: `${payload}:${signature}`, expires };
}

export function verifySessionToken(token: string): { userId: number } | null {
  const parts = token.split(':');
  if (parts.length !== 3) return null;
  const [userIdStr, expiresStr, signature] = parts;
  const payload = `${userIdStr}:${expiresStr}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
  if (Date.now() > parseInt(expiresStr, 10)) return null;
  return { userId: parseInt(userIdStr, 10) };
}
