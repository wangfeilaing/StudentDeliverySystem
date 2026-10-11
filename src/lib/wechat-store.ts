import { getDb } from '@/lib/db';

const WECHAT_API_BASE = 'https://api.weixin.qq.com';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function getSecretKey(): Buffer {
  // Derive a 32-byte key from a fixed project salt — not perfect but prevents plaintext storage
  const crypto = require('crypto');
  return crypto.createHash('sha256').update('claude-code-ip-platform-wx-store').digest();
}

function encrypt(text: string): string {
  const crypto = require('crypto');
  const key = getSecretKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encoded: string): string {
  const crypto = require('crypto');
  const key = getSecretKey();
  const parts = encoded.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts.slice(1).join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function getWechatStoreCredentials(): { appid: string; appsecret: string } | null {
  const db = getDb();
  const appid = db.prepare("SELECT value FROM system_settings WHERE key = 'wechat_store_appid'").get() as { value: string } | undefined;
  const encSecret = db.prepare("SELECT value FROM system_settings WHERE key = 'wechat_store_appsecret'").get() as { value: string } | undefined;
  if (!appid?.value || !encSecret?.value) return null;
  return { appid: appid.value, appsecret: decrypt(encSecret.value) };
}

export function saveWechatStoreCredentials(appid: string, appsecret: string) {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('wechat_store_appid', ?)").run(appid);
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('wechat_store_appsecret', ?)").run(encrypt(appsecret));
}

async function getAccessToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const creds = getWechatStoreCredentials();
  if (!creds) return null;

  const url = `${WECHAT_API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${creds.appid}&secret=${creds.appsecret}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.access_token) {
    tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
    return tokenCache.token;
  }
  console.error('Failed to get wechat access_token:', data);
  return null;
}

interface OrderListResponse {
  errcode: number;
  errmsg: string;
  order_id_list?: string[];
  next_key?: string;
  has_more?: boolean;
}

interface OrderDetailResponse {
  errcode: number;
  errmsg: string;
  order?: {
    order_id: number;
    status: number;
    create_time: number;
    update_time: number;
    openid: string;
    order_detail?: {
      product_infos?: Array<{
        title: string;
        sku_cnt: number;
        sale_price: number;
      }>;
      pay_info?: {
        payment_method: number;
        pay_time: number;
        transaction_id: string;
      };
      price_info?: {
        order_price: number;
      };
      delivery_info?: {
        deliver_method?: number;
        address_info?: {
          user_name: string;
          tel_number: string;
          virtual_order_tel_number?: string;
          province_name: string;
          city_name: string;
          county_name: string;
          detail_info: string;
        };
      };
    };
  };
}

interface DecodeResponse {
  errcode: number;
  errmsg: string;
  address_info?: {
    user_name: string;
    tel_number: string;
    province_name: string;
    city_name: string;
    county_name: string;
    detail_info: string;
  };
}

async function fetchOrderList(accessToken: string, startTime: number, endTime: number, nextKey?: string): Promise<OrderListResponse> {
  const body: Record<string, unknown> = {
    create_time_range: { start_time: startTime, end_time: endTime },
    page_size: 100,
  };
  if (nextKey) body.next_key = nextKey;
  const res = await fetch(`${WECHAT_API_BASE}/channels/ec/order/list/get?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fetchOrderDetail(accessToken: string, orderId: string): Promise<OrderDetailResponse> {
  const res = await fetch(`${WECHAT_API_BASE}/channels/ec/order/get?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId }),
  });
  return res.json();
}

async function decodeOrderInfo(accessToken: string, orderId: string): Promise<DecodeResponse> {
  const res = await fetch(`${WECHAT_API_BASE}/channels/ec/order/sensitiveinfo/decode?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId }),
  });
  return res.json();
}

function toLocalTimeStr(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const CHUNK_SECONDS = 6 * 24 * 3600; // keep under API's 7-day limit per query

export async function syncWechatOrders(days = 30): Promise<{ newOrders: number; totalOrders: number; error?: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) return { newOrders: 0, totalOrders: 0, error: '无法获取 access_token，请检查 AppID/AppSecret 配置' };

  const db = getDb();

  const endTime = Math.floor(Date.now() / 1000);
  const overallStart = endTime - days * 24 * 3600;

  const allOrderIds: string[] = [];
  let chunkStart = overallStart;

  // Paginate through time in 7-day chunks
  while (chunkStart < endTime) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SECONDS, endTime);
    let nextKey: string | undefined;

    do {
      const listRes = await fetchOrderList(accessToken, chunkStart, chunkEnd, nextKey);
      if (listRes.errcode !== 0) {
        return { newOrders: 0, totalOrders: 0, error: `获取订单列表失败：${listRes.errmsg} (errcode=${listRes.errcode})` };
      }
      if (listRes.order_id_list) {
        for (const oid of listRes.order_id_list) {
          if (!allOrderIds.includes(oid)) allOrderIds.push(oid);
        }
      }
      nextKey = listRes.has_more ? listRes.next_key : undefined;
    } while (nextKey);

    chunkStart = chunkEnd;
  }

  const orderIds = allOrderIds;

  // Get existing order IDs to skip
  const placeholders = orderIds.map(() => '?').join(',');
  const existingIds = new Set<string>();
  if (orderIds.length > 0) {
    const rows = db.prepare(
      `SELECT order_id FROM wechat_orders WHERE order_id IN (${placeholders})`
    ).all(...orderIds) as Array<{ order_id: string }>;
    rows.forEach(r => existingIds.add(r.order_id));
  }

  const newIds = orderIds.filter(id => !existingIds.has(id));
  let newCount = 0;

  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO wechat_orders
    (order_id, status, buyer_name, buyer_phone, buyer_province, buyer_city, buyer_address,
     product_names, product_count, order_amount, payment_method, pay_time,
     create_time, update_time, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Also backfill existing orders that are missing name (within the sync window)
  const backfillDateConstraint = `datetime('now', '-${days} days', 'localtime')`;
  const needBackfill = db.prepare(
    `SELECT order_id FROM wechat_orders WHERE buyer_name = '' AND status IN (20, 21, 30, 100) AND create_time >= ${backfillDateConstraint}`
  ).all() as Array<{ order_id: string }>;

  const updateOrderName = db.prepare("UPDATE wechat_orders SET buyer_name = ? WHERE order_id = ?");
  const updateOrderBoth = db.prepare("UPDATE wechat_orders SET buyer_name = ?, buyer_phone = ? WHERE order_id = ?");

  // Separate: orders missing BOTH name and phone (need full detail fetch)
  const needBoth = db.prepare(
    `SELECT order_id FROM wechat_orders WHERE buyer_name = '' AND buyer_phone = '' AND status IN (20, 21, 30, 100) AND create_time >= ${backfillDateConstraint}`
  ).all() as Array<{ order_id: string }>;

  for (const row of needBoth) {
    const detailRes = await fetchOrderDetail(accessToken, row.order_id);
    if (detailRes.errcode !== 0 || !detailRes.order) continue;

    const delivery = detailRes.order.order_detail?.delivery_info;
    const addr = delivery?.address_info;
    let phone = '';
    if (delivery?.deliver_method === 1) {
      phone = addr?.virtual_order_tel_number || '';
    } else {
      phone = addr?.tel_number || '';
    }
    let buyerName = addr?.user_name || '';

    if (!buyerName) {
      const decodeRes = await decodeOrderInfo(accessToken, row.order_id);
      if (decodeRes.errcode === 0 && decodeRes.address_info) {
        buyerName = decodeRes.address_info.user_name || '';
        if (!phone) phone = decodeRes.address_info.tel_number || '';
      }
    }

    if (buyerName || phone) {
      updateOrderBoth.run(buyerName, phone, row.order_id);
    }
  }

  // Orders that have phone but no name — just call decode API, don't touch phone
  for (const row of needBackfill) {
    const decodeRes = await decodeOrderInfo(accessToken, row.order_id);
    if (decodeRes.errcode !== 0 || !decodeRes.address_info) continue;
    const buyerName = decodeRes.address_info.user_name || '';
    if (buyerName) {
      updateOrderName.run(buyerName, row.order_id);
    }
  }

  for (const oid of newIds) {
    const detailRes = await fetchOrderDetail(accessToken, oid);
    if (detailRes.errcode !== 0 || !detailRes.order) continue;

    const order = detailRes.order;
    const delivery = order.order_detail?.delivery_info;
    const addr = delivery?.address_info;
    const products = order.order_detail?.product_infos || [];
    const payInfo = order.order_detail?.pay_info;
    const priceInfo = order.order_detail?.price_info;

    // Phone: for virtual goods (deliver_method=1), use virtual_order_tel_number
    // For physical goods, use tel_number from address_info
    let phone = '';
    if (delivery?.deliver_method === 1) {
      phone = addr?.virtual_order_tel_number || '';
    } else {
      phone = addr?.tel_number || '';
    }

    // Name: try decrypt API for orders that are in decryptable status
    let buyerName = addr?.user_name || '';
    const decryptableStatuses = [20, 21, 30, 100]; // non-cancelled, non-pending
    if (!buyerName && decryptableStatuses.includes(order.status)) {
      const decodeRes = await decodeOrderInfo(accessToken, String(order.order_id));
      if (decodeRes.errcode === 0 && decodeRes.address_info) {
        buyerName = decodeRes.address_info.user_name || '';
        if (!phone) phone = decodeRes.address_info.tel_number || '';
      }
    }

    const productNames = products.map(p => p.title).join('、');

    const totalCount = products.reduce((sum, p) => sum + (p.sku_cnt || 0), 0);
    const amount = priceInfo?.order_price || 0;

    insertOrder.run(
      String(order.order_id),
      order.status,
      buyerName,
      phone,
      addr?.province_name || '',
      (addr?.city_name || '') + (addr?.county_name || ''),
      (addr?.detail_info || ''),
      productNames,
      totalCount,
      amount / 100,
      payInfo?.payment_method || null,
      payInfo?.pay_time ? toLocalTimeStr(payInfo.pay_time) : null,
      toLocalTimeStr(order.create_time),
      toLocalTimeStr(order.update_time),
      JSON.stringify(detailRes.order),
    );
    newCount++;
  }

  return { newOrders: newCount, totalOrders: orderIds.length };
}

/**
 * Webhook 专用：拉取并 upsert 单条订单。
 * 已存在则更新（状态/金额/时间等变更会同步），不存在则新增。
 * 解析逻辑与 syncWechatOrders 的循环体保持一致。
 * @returns isNew 是否为本次新增；null 表示拉取失败
 */
export async function upsertWechatOrder(orderId: string): Promise<{
  isNew: boolean;
  buyerName: string;
  productNames: string;
  status: number;
  amount: number;
} | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const db = getDb();

  const detailRes = await fetchOrderDetail(accessToken, orderId);
  if (detailRes.errcode !== 0 || !detailRes.order) return null;

  const order = detailRes.order;
  const delivery = order.order_detail?.delivery_info;
  const addr = delivery?.address_info;
  const products = order.order_detail?.product_infos || [];
  const payInfo = order.order_detail?.pay_info;
  const priceInfo = order.order_detail?.price_info;

  let phone = '';
  if (delivery?.deliver_method === 1) phone = addr?.virtual_order_tel_number || '';
  else phone = addr?.tel_number || '';

  let buyerName = addr?.user_name || '';
  const decryptableStatuses = [20, 21, 30, 100];
  if (!buyerName && decryptableStatuses.includes(order.status)) {
    const decodeRes = await decodeOrderInfo(accessToken, String(order.order_id));
    if (decodeRes.errcode === 0 && decodeRes.address_info) {
      buyerName = decodeRes.address_info.user_name || '';
      if (!phone) phone = decodeRes.address_info.tel_number || '';
    }
  }

  const productNames = products.map(p => p.title).join('、');
  const totalCount = products.reduce((sum, p) => sum + (p.sku_cnt || 0), 0);
  const amount = (priceInfo?.order_price || 0) / 100;

  const existing = db.prepare('SELECT id FROM wechat_orders WHERE order_id = ?').get(String(order.order_id));

  db.prepare(`
    INSERT INTO wechat_orders
      (order_id, status, buyer_name, buyer_phone, buyer_province, buyer_city, buyer_address,
       product_names, product_count, order_amount, payment_method, pay_time,
       create_time, update_time, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      status = excluded.status,
      buyer_name = CASE WHEN excluded.buyer_name != '' THEN excluded.buyer_name ELSE wechat_orders.buyer_name END,
      buyer_phone = CASE WHEN excluded.buyer_phone != '' THEN excluded.buyer_phone ELSE wechat_orders.buyer_phone END,
      product_names = excluded.product_names,
      product_count = excluded.product_count,
      order_amount = excluded.order_amount,
      payment_method = excluded.payment_method,
      pay_time = excluded.pay_time,
      update_time = excluded.update_time,
      raw_json = excluded.raw_json,
      synced_at = datetime('now','localtime')
  `).run(
    String(order.order_id), order.status, buyerName, phone,
    addr?.province_name || '', (addr?.city_name || '') + (addr?.county_name || ''), (addr?.detail_info || ''),
    productNames, totalCount, amount,
    payInfo?.payment_method || null,
    payInfo?.pay_time ? toLocalTimeStr(payInfo.pay_time) : null,
    toLocalTimeStr(order.create_time), toLocalTimeStr(order.update_time),
    JSON.stringify(detailRes.order),
  );

  return { isNew: !existing, buyerName, productNames, status: order.status, amount };
}

// ---- 小店消息推送回调 Token / EncodingAESKey ----
// 部署时请在「微信小店后台 → 消息推送」里配置同样的值；下面是默认值，可被 system_settings 覆盖。
const DEFAULT_STORE_CALLBACK_TOKEN = 'DEMO_CALLBACK_TOKEN_0123456789';
const DEFAULT_STORE_CALLBACK_AESKEY = 'lSFSnP/HfPe9Ur5JVG3HjHd8irwBkSeNX7Tp4O9LLxU';

export function getWechatStoreCallbackConfig(): { token: string; aesKey: string } {
  const db = getDb();
  const t = db.prepare("SELECT value FROM system_settings WHERE key = 'wechat_store_callback_token'").get() as { value: string } | undefined;
  const k = db.prepare("SELECT value FROM system_settings WHERE key = 'wechat_store_callback_aeskey'").get() as { value: string } | undefined;
  return {
    token: t?.value || DEFAULT_STORE_CALLBACK_TOKEN,
    aesKey: k?.value || DEFAULT_STORE_CALLBACK_AESKEY,
  };
}

export function saveWechatStoreCallbackConfig(token: string, aesKey: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('wechat_store_callback_token', ?)").run(token);
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('wechat_store_callback_aeskey', ?)").run(aesKey);
}
