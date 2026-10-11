import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import {
  getWecomConfigs,
  getWecomStaffList,
  saveWecomConfig,
  deleteWecomConfig,
  saveWecomStaff,
  deleteWecomStaff,
  syncWecomContacts,
  getWecomContactWays,
  createWecomContactWay,
} from '@/lib/wecom';

// GET /api/wecom — list configs + staff
export async function GET() {
  try {
    const configs = getWecomConfigs();
    const staff = getWecomStaffList();
    const contactWays = getWecomContactWays();
    return jsonResponse({ configs, staff, contactWays });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

// POST /api/wecom — save config, add staff, or trigger sync
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const body = await request.json();

    switch (body.action) {
      case 'save_config': {
        const { corpId, secret, label } = body;
        if (!corpId || !secret) return errorResponse('请填写 corpId 和 secret', 400);
        saveWecomConfig(corpId, secret, label || '');
        return jsonResponse({ success: true });
      }

      case 'add_staff': {
        const { configId, salesName, wecomUserid } = body;
        if (!configId || !salesName || !wecomUserid) return errorResponse('请填写完整的员工信息', 400);
        saveWecomStaff(configId, salesName, wecomUserid);
        return jsonResponse({ success: true });
      }

      case 'sync': {
        const result = await syncWecomContacts();
        if (result.error) return errorResponse(result.error, 400);
        return jsonResponse({
          message: `企微同步完成：匹配 ${result.bindings} 条绑定`,
          bindings: result.bindings,
        });
      }

      case 'create_contact_way': {
        const staffId = parseInt(String(body.staffId || ''), 10);
        const channel = String(body.channel || 'xczd');
        if (!staffId) return errorResponse('请选择销售员工', 400);
        const contactWay = await createWecomContactWay(staffId, channel);
        return jsonResponse({ contactWay });
      }

      default:
        return errorResponse('未知操作', 400);
    }
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}

// DELETE /api/wecom — delete config or staff
export async function DELETE(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '', 10);
    const type = url.searchParams.get('type') || '';

    if (!id || !type) return errorResponse('缺少参数', 400);

    if (type === 'config') {
      deleteWecomConfig(id);
    } else if (type === 'staff') {
      deleteWecomStaff(id);
    } else {
      return errorResponse('类型无效', 400);
    }

    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
