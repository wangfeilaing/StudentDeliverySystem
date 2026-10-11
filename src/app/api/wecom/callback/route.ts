import { NextResponse } from 'next/server';
import { calcSignature, verifySignature, decryptMessage, pickXmlTag } from '@/lib/wx-crypto';
import { getWecomCallbackConfig, resolveSalesByWecomUserId, resolveSalesByState, syncWecomContacts } from '@/lib/wecom';
import { createNotification } from '@/lib/notifications';

// 企业微信「客户联系」事件回调。
// 部署后在企微管理后台 → 自建应用 → 接收消息，配置 URL = https://你的域名/api/wecom/callback，
// 并填 Token / EncodingAESKey（与 wecom_config 表或代码默认值一致）。

// GET — URL 有效性验证：校验 msg_signature 后解密 echostr 原样返回。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const msgSignature = url.searchParams.get('msg_signature') || '';
  const timestamp = url.searchParams.get('timestamp') || '';
  const nonce = url.searchParams.get('nonce') || '';
  const echostr = url.searchParams.get('echostr') || '';
  const { token, aesKey } = getWecomCallbackConfig();

  if (!echostr) return new NextResponse('missing echostr', { status: 400 });

  try {
    const expected = calcSignature(token, timestamp, nonce, echostr);
    // 验签失败必须拒绝：否则任何人都能拿这个接口做解密预言机
    if (!verifySignature(expected, msgSignature)) {
      console.warn('[企微callback][GET] msg_signature 不匹配，已拒绝');
      return new NextResponse('signature mismatch', { status: 401 });
    }
    const { message } = decryptMessage(aesKey, echostr);
    console.log('[企微callback][GET] 验证通过');
    return new NextResponse(message, { headers: { 'Content-Type': 'text/plain' } });
  } catch (e) {
    console.error('[企微callback][GET] 验证失败:', e);
    return new NextResponse('verify failed', { status: 400 });
  }
}

// POST — 接收事件。重点处理「客户联系」的 add_external_contact（销售添加了客户）。
export async function POST(request: Request) {
  const url = new URL(request.url);
  const msgSignature = url.searchParams.get('msg_signature') || '';
  const timestamp = url.searchParams.get('timestamp') || '';
  const nonce = url.searchParams.get('nonce') || '';
  const { token, aesKey } = getWecomCallbackConfig();

  let body = '';
  try {
    body = await request.text();
  } catch {
    return new NextResponse('success');
  }

  console.log('[企微callback][POST] raw:', body.slice(0, 2000));

  try {
    const encrypt = pickXmlTag(body, 'Encrypt');
    // 企微回调只会以加密形式推送。没有密文、或密文验签不过，一律拒绝，
    // 否则任何人 POST 一段明文 XML 就能伪造「销售加了客户」并触发同步。
    if (!encrypt) {
      console.warn('[企微callback][POST] 缺少 Encrypt 密文，已拒绝');
      return new NextResponse('rejected: plaintext callback', { status: 401 });
    }
    const expected = calcSignature(token, timestamp, nonce, encrypt);
    if (!verifySignature(expected, msgSignature)) {
      console.warn('[企微callback][POST] msg_signature 不匹配，已拒绝');
      return new NextResponse('signature mismatch', { status: 401 });
    }
    const xml = decryptMessage(aesKey, encrypt).message;
    console.log('[企微callback][POST] decrypted:', xml.slice(0, 2000));

    const event = pickXmlTag(xml, 'Event');
    const changeType = pickXmlTag(xml, 'ChangeType');

    // 销售新增了一位客户企微好友
    if (event === 'change_external_contact' && (changeType === 'add_external_contact' || changeType === 'add_half_external_contact')) {
      const wecomUserId = pickXmlTag(xml, 'UserID');
      const externalUserId = pickXmlTag(xml, 'ExternalUserID');
      const state = pickXmlTag(xml, 'State');

      const salesName = resolveSalesByState(state) || resolveSalesByWecomUserId(wecomUserId) || wecomUserId || '未知销售';
      const channelTip = state ? ` · 渠道 ${state}` : '';

      createNotification({
        type: 'wecom_added',
        title: `销售「${salesName}」新加了一位客户企微`,
        body: `客户 ${externalUserId || '—'}${channelTip}`,
        salesName,
      });
      console.log('[企微callback][POST] add_external_contact ->', salesName, externalUserId);

      // 触发一次外部联系人同步，把这条 add 尽快匹配/绑定到对应订单（不阻塞响应）
      syncWecomContacts()
        .then(r => console.log('[企微callback][POST] syncWecomContacts bindings=', r?.bindings))
        .catch(e => console.error('[企微callback][POST] syncWecomContacts error', e));
    }
  } catch (e) {
    console.error('[企微callback][POST] 处理失败:', e);
  }

  return new NextResponse('success');
}
