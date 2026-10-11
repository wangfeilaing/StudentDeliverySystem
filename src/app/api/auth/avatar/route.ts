import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

export async function PUT(request: Request) {
  try {
    const user = await requireAuth();
    const formData = await request.formData();
    const avatarFile = formData.get('avatar') as File | null;

    if (!avatarFile || avatarFile.size === 0) {
      return errorResponse('请选择头像文件', 400);
    }

    const db = getDb();

    // Delete old avatar file if exists
    const current = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(user.id) as { avatar_path: string | null } | undefined;
    if (current?.avatar_path) {
      const oldPath = path.join(UPLOADS_DIR, current.avatar_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Save new avatar
    const ext = path.extname(avatarFile.name) || '.jpg';
    const fileName = `${uuidv4()}${ext}`;
    const dir = path.join(UPLOADS_DIR, 'avatars', 'users', String(user.id));
    fs.mkdirSync(dir, { recursive: true });
    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    fs.writeFileSync(path.join(dir, fileName), buffer);

    const relativePath = `avatars/users/${user.id}/${fileName}`;
    db.prepare("UPDATE users SET avatar_path = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(relativePath, user.id);

    return jsonResponse({ avatar_path: relativePath });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
