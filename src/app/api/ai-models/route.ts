import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { listModels, createModel } from '@/lib/ai';
import { logOperation } from '@/lib/logger';

// GET /api/ai-models — 列表（脱敏）
export async function GET() {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    return jsonResponse({ items: listModels() });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

// POST /api/ai-models — 新增模型
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const body = await request.json().catch(() => ({}));
    if (!body.name || !body.model) return errorResponse('请填写名称和模型', 400);
    const id = createModel({
      name: String(body.name),
      provider: body.provider === 'anthropic' ? 'anthropic' : 'openai',
      base_url: String(body.base_url || ''),
      api_key: String(body.api_key || ''),
      model: String(body.model),
      is_default: !!body.is_default,
    });
    await logOperation('create', 'ai_model', id, `新增模型 ${body.name}`);
    return jsonResponse({ success: true, id });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
