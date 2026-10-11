import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { testModel } from '@/lib/ai';

// POST /api/ai-models/[id]/test — 测试模型连通性
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const id = parseId(await params);
    const reply = await testModel(id);
    return jsonResponse({ success: true, reply });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse(`测试失败：${(e as Error).message}`, 400);
  }
}
