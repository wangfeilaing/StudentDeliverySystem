import crypto from 'crypto';

/**
 * 微信 / 企业微信 回调消息的验签与 AES 解密。
 *
 * 视频号小店「消息推送」与企业微信「客户联系回调」使用同一套算法：
 *   - 签名：msg_signature = sha1( [token, timestamp, nonce, encrypt].sort().join('') )
 *     （URL 验证时若为明文模式，待签名数组里没有 encrypt/echostr，调用方自行决定传哪些）
 *   - 加密：AES-256-CBC，key = base64decode(EncodingAESKey + '=')（32 字节），IV = key 前 16 字节
 *   - 明文结构：16 字节随机 + 4 字节(网络字节序)消息长度 + 消息体 + receiveid(corpid/appid)
 */

/** 计算 sha1 签名（参数会先排序拼接）。 */
export function calcSignature(...parts: string[]): string {
  return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');
}

/** 恒定时间比较签名，避免时序攻击。 */
export function verifySignature(expected: string, actual: string): boolean {
  if (!expected || !actual || expected.length !== actual.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}

/** 解密回调密文，返回明文消息与 receiveid。 */
export function decryptMessage(encodingAESKey: string, encrypted: string): { message: string; receiveId: string } {
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64'); // 32 字节
  const iv = aesKey.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(Buffer.from(encrypted, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  // 去除 PKCS#7 填充
  const padLength = decrypted[decrypted.length - 1];
  const unpadded = decrypted.subarray(0, decrypted.length - padLength);
  const msgLen = unpadded.readUInt32BE(16);
  const message = unpadded.subarray(20, 20 + msgLen).toString('utf8');
  const receiveId = unpadded.subarray(20 + msgLen).toString('utf8');
  return { message, receiveId };
}

/** 从回调 XML 中提取单个标签内容（兼容 CDATA）。回调体很小，正则足够，不引入 XML 依赖。 */
export function pickXmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : '';
}
