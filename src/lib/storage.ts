import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

export type UploadType = 'avatars' | 'screenshots' | 'videos' | 'delivery';

export function saveUpload(
  buffer: Buffer,
  originalName: string,
  type: UploadType,
  ipId: number
): { filePath: string; fileName: string } {
  const ext = path.extname(originalName) || '.bin';
  const fileName = `${uuidv4()}${ext}`;
  const dir = path.join(UPLOADS_DIR, type, String(ipId));
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(fullPath, buffer);
  const relativePath = `${type}/${ipId}/${fileName}`;
  return { filePath: relativePath, fileName };
}

export function deleteFile(relativePath: string) {
  const fullPath = path.join(UPLOADS_DIR, relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

export function deleteIpFiles(ipId: number) {
  for (const type of ['avatars', 'screenshots', 'videos', 'delivery'] as UploadType[]) {
    const dir = path.join(UPLOADS_DIR, type, String(ipId));
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

export function getUploadPath(relativePath: string): string {
  return path.join(UPLOADS_DIR, relativePath);
}

export function getUploadDir(): string {
  return UPLOADS_DIR;
}
