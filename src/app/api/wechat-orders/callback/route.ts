import { NextResponse } from 'next/server';
import { calcSignature, verifySignature, decryptMessage, pickXmlTag } from '@/lib/wx-crypto';
import { getWechatStoreCallbackConfig, upsertWechatOrder } from '@/lib/wechat-store';

// 视频号小店「消息推送」回调。
// 部署后在小店后台填入：回调 URL = https://你的域名/api/wechat-orders/callback，
// 以及与代码一致的 Token / EncodingAESKey（见 getWechatStoreCallbackConfig 默认值，可在 system_settings 覆盖）。

// GET — URL 有效性验证。兼容两种模式：
//   明文模式：?signature&timestamp&nonce&echostr  → 校验 sha1(token,timestamp,nonce) 后原样返回 echostr
//   安全模式：?msg_signature&timestamp&nonce&echostr → 校验后解密 echostr 返回明文
export async function GET(request: Request) {
  const url = new URL(request.url);
  const signature = url.searchParams.get('signature') || '';
  const msgSignature = url.searchParams.get('msg_signature') || '';
  const timestamp = url.searchParams.get('timestamp') || '';
  const nonce = url.searchParams.get('nonce') || '';
  const echostr = url.searchParams.get('echostr') || '';
  const { token, aesKey } = getWechatStoreCallbackConfig();

  console.log('[小店callback][GET] verify', { hasSig: !!signature, hasMsgSig: !!msgSignature, timestamp, nonce });

  try {
    if (msgSignature) {
      // 安全模式
      const expected = calcSignature(token, timestamp, nonce, echostr);
      if (!verifySignature(expected, msgSignature)) {
        console.warn('[小店callback][GET] msg_signature 不匹配，已拒绝');
        return new NextResponse('signature mismatch', { status: 401 });
      }
      const { message } = decryptMessage(aesKey, echostr);
      return new NextResponse(message, { headers: { 'Content-Type': 'text/plain' } });
    }
    // 明文模式
    const expected = calcSignature(token, timestamp, nonce);
    if (!verifySignature(expected, signature)) {
      console.warn('[小店callback][GET] signature 不匹配');
      return new NextResponse('signature mismatch', { status: 400 });
    }
    return new NextResponse(echostr, { headers: { 'Content-Type': 'text/plain' } });
  } catch (e) {
    console.error('[小店callback][GET] 验证失败:', e);
    return new NextResponse('verify failed', { status: 400 });
  }
}

// POST — 接收订单事件。视频号小店事件如 channels_ec_order_pay / order_new / order_state_change 等。
// 收到后取出 order_id，调用 upsertWechatOrder 拉取该单详情并入库。
export async function POST(request: Request) {
  const url = new URL(request.url);
  const msgSignature = url.searchParams.get('msg_signature') || '';
  const timestamp = url.searchParams.get('timestamp') || '';
  const nonce = url.searchParams.get('nonce') || '';
  const { token, aesKey } = getWechatStoreCallbackConfig();

  let body = '';
  try {
    body = await request.text();
  } catch {
    return new NextResponse('success'); // 始终回 success，避免微信重试风暴（轮询作为兜底）
  }

  // 打印原始推送，首次真实事件可据此核对字段
  console.log('[小店callback][POST] raw:', body.slice(0, 2000));

  try {
    let xml = body;
    const encrypt = pickXmlTag(body, 'Encrypt');
    if (encrypt) {
      // 安全模式：验签 + 解密。验签不过一律拒绝，否则任何人可以伪造订单事件。
      const expected = calcSignature(token, timestamp, nonce, encrypt);
      if (!verifySignature(expected, msgSignature)) {
        console.warn('[小店callback][POST] msg_signature 不匹配，已拒绝');
        return new NextResponse('signature mismatch', { status: 401 });
      }
      xml = decryptMessage(aesKey, encrypt).message;
      console.log('[小店callback][POST] decrypted:', xml.slice(0, 2000));
    } else {
      // 明文模式：必须提供可校验的 signature（sha1(token,timestamp,nonce)）
      const expected = calcSignature(token, timestamp, nonce);
      if (!verifySignature(expected, url.searchParams.get('signature') || '')) {
        console.warn('[小店callback][POST] 明文模式 signature 不匹配，已拒绝');
        return new NextResponse('signature mismatch', { status: 401 });
      }
      console.log('[小店callback][POST] plaintext (signature ok):', body.slice(0, 500));
    }

    // 容错取 order_id（不同事件字段名可能不同，先广撒网）
    const orderId =
      pickXmlTag(xml, 'order_id') ||
      pickXmlTag(xml, 'OrderId') ||
      pickXmlTag(xml, 'OrderID') ||
      pickXmlTag(xml, 'ext_info');

    if (orderId) {
      // 不阻塞响应：异步拉取入库，微信侧只需尽快收到 success
      upsertWechatOrder(orderId)
        .then(r => console.log('[小店callback][POST] upsert', orderId, r ? (r.isNew ? '新增' : '更新') : '失败'))
        .catch(e => console.error('[小店callback][POST] upsert error', orderId, e));
    } else {
      console.warn('[小店callback][POST] 未能从事件中解析出 order_id，请据上面的原始/解密内容补充字段名');
    }
  } catch (e) {
    console.error('[小店callback][POST] 处理失败:', e);
  }

  return new NextResponse('success'); // 微信小店要求 5 秒内返回 success
}
