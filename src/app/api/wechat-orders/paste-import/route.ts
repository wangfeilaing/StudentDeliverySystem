import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

// Parse order blocks from copied WeChat Store admin page
// Format: 订单号: <id> ... <product> ... <nickname> \n 手机号 \n <phone>
function parseBlocks(text: string): Array<{ orderId: string; phone: string; name: string; product: string }> {
  const results: Array<{ orderId: string; phone: string; name: string; product: string }> = [];
  const seen = new Set<string>();

  const blocks = text.split(/订单号[：:]\s*/);
  for (const block of blocks) {
    if (!block.trim()) continue;

    const oidMatch = block.match(/^(\d{18,20})/);
    const orderId = oidMatch ? oidMatch[1] : '';
    if (!orderId || seen.has(orderId)) continue;
    seen.add(orderId);

    const lines = block.split(/\r?\n/);

    // Find "手机号" line
    const phoneLabelIdx = lines.findIndex(l => /^手机号/.test(l.trim()));
    if (phoneLabelIdx < 0) continue;

    // Phone number on the line AFTER "手机号"
    let phone = '';
    if (phoneLabelIdx + 1 < lines.length) {
      phone = normalizePhone(lines[phoneLabelIdx + 1].trim());
    }
    if (!phone || phone.length !== 11) continue;

    // Nickname on the line immediately BEFORE "手机号"
    let name = '';
    for (let i = phoneLabelIdx - 1; i >= 0; i--) {
      const candidate = lines[i].trim();
      if (!candidate) continue;
      let cleaned = candidate.replace(/发消息$/, '').trim();
      cleaned = cleaned.replace(/[\s]*1[3-9]\d[\d\s]{8,14}\d$/, '').trim();
      if (cleaned.length >= 2 && cleaned.length <= 50) {
        name = cleaned;
        break;
      }
    }

    // Extract product name for context — the line containing "特训营" or "IP十倍" or "IP"
    let product = '';
    for (const l of lines) {
      const t = l.trim();
      if (t.includes('特训营') || t.includes('IP十倍') || t.includes('高客单')) {
        product = t;
        break;
      }
    }

    if (name && phone) {
      results.push({ orderId, phone, name, product });
    }
  }

  return results;
}

// POST /api/wechat-orders/paste-import
// mode=preview: just parse and return pairs for review
// mode=apply:  apply the confirmed pairs
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator', 'business']);
    const body = await request.json();

    // ---- Apply mode: receive confirmed pairs ----
    if (body.mode === 'apply') {
      const pairs = body.pairs as Array<{ orderId: string; name: string }>;
      if (!pairs || pairs.length === 0) return errorResponse('没有要导入的数据', 400);

      const db = getDb();
      const updateByOrderId = db.prepare('UPDATE wechat_orders SET buyer_name = ? WHERE order_id = ?');
      let count = 0;
      for (const { orderId, name } of pairs) {
        const r = updateByOrderId.run(name, orderId);
        if (r.changes > 0) count++;
      }
      return jsonResponse({ message: `成功更新 ${count} 单`, matched: count });
    }

    // ---- Preview mode: parse and return ----
    const { text } = body;
    if (!text || text.trim().length < 20) {
      return errorResponse('请粘贴微信小店后台的订单列表内容', 400);
    }

    const pairs = parseBlocks(text);

    if (pairs.length === 0) {
      return errorResponse('未能识别出订单，请确认复制内容包含「订单号」、「手机号」等字段', 400);
    }

    return jsonResponse({ pairs, total: pairs.length });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
