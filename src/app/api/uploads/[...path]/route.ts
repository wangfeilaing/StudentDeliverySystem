import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getUploadDir } from '@/lib/storage';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
};

// 超过该大小的文件不再整块读进内存，避免一个请求打满内存。
const INLINE_MAX_BYTES = 32 * 1024 * 1024;

/**
 * 把 URL 里的相对路径解析成 uploads 目录内的绝对路径。
 * 任何越出 uploads 目录的输入（../、绝对路径、盘符、NUL 等）一律返回 null。
 * 这是防止 /api/uploads/..%2Fapp.db 读到数据库/.env 的关键校验。
 */
function resolveWithinUploads(segments: string[]): string | null {
  const uploadsRoot = path.resolve(getUploadDir());
  const joined = segments.join('/');
  if (!joined) return null;
  // 拒绝 NUL 字节（可能截断底层系统调用）
  if (joined.includes('\0')) return null;

  const target = path.resolve(uploadsRoot, joined);
  const relative = path.relative(uploadsRoot, target);
  // relative 为空表示就是目录本身；以 .. 开头或以盘符/根开头表示逃出了 uploads
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  const fullPath = resolveWithinUploads(pathSegments ?? []);
  if (!fullPath) {
    return new NextResponse('Not Found', { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
  // 只提供普通文件：目录、符号链接指向的目录一律不处理
  if (!stat.isFile()) {
    return new NextResponse('Not Found', { status: 404 });
  }
  if (stat.size > INLINE_MAX_BYTES) {
    return new NextResponse('Payload Too Large', { status: 413 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const buffer = fs.readFileSync(fullPath);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      // 这些文件位于登录墙之后，不应被 CDN/代理跨用户缓存
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
