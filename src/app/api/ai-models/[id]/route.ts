import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { updateModel, deleteModel } from '@/lib/ai';
import { logOperation } from '@/lib/logger';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const id = parseId(await params);
    const body = await request.json().catch(() => ({}));
    updateModel(id, body);
    await logOperation('update', 'ai_model', id, '更新模型配置');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const id = parseId(await params);
    deleteModel(id);
    await logOperation('delete', 'ai_model', id, '删除模型');
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
