import { errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

// POST /api/content/[id]/transcribe — 语音转写（待接入）
// 预留接口：第二期接入 Whisper（本地）后，在此下载视频音频、转写为文字，
// 写回 transcript、把 status 置为 'transcribed'。
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    await params;
    return errorResponse('语音转写功能待接入 Whisper（第二期）。框架已就绪。', 501);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
