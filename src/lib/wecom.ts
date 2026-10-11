import { getDb } from '@/lib/db';
import crypto from 'crypto';

const WECOM_API_BASE = 'https://qyapi.weixin.qq.com';

// ---- encryption helpers (reuse same pattern as wechat-store) ----

function getSecretKey(): Buffer {
  return crypto.createHash('sha256').update('claude-code-ip-platform-wx-store').digest();
}

function encrypt(text: string): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encoded: string): string {
  const key = getSecretKey();
  const parts = encoded.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts.slice(1).join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---- types ----

export interface WecomConfig {
  id: number;
  corp_id: string;
  secret: string;
  callback_token: string;
  aes_key: string;
  label: string;
}

export interface WecomStaff {
  id: number;
  config_id: number;
  sales_name: string;
  wecom_userid: string;
}

export interface WecomBinding {
  id: number;
  order_id: string;
  sales_name: string;
  external_userid: string;
  contact_name: string;
  contact_phone: string;
  added_at: string;
  state: string;
  match_method: string;
  confidence: number;
}

export interface WecomContactWay {
  id: number;
  config_id: number;
  staff_id: number | null;
  sales_name: string;
  wecom_userid: string;
  state: string;
  remark: string;
  contact_way_config_id: string;
  qr_code: string;
  status: string;
  created_at: string;
}

// ---- config CRUD ----

// ---- 企微回调 Token / EncodingAESKey ----
// 优先取数据库 wecom_config 里配置的值；为空则回退到下面的默认值（与历史硬编码一致，保证已有配置不受影响）。
const FALLBACK_WECOM_CALLBACK_TOKEN = 'DEMO_CALLBACK_TOKEN_0123456789';
const FALLBACK_WECOM_AES_KEY = 'lSFSnP/HfPe9Ur5JVG3HjHd8irwBkSeNX7Tp4O9LLxU';

export function getWecomCallbackConfig(): { token: string; aesKey: string; corpId: string } {
  const db = getDb();
  const cfg = db.prepare(
    "SELECT corp_id, callback_token, aes_key FROM wecom_config ORDER BY id LIMIT 1"
  ).get() as { corp_id: string; callback_token: string; aes_key: string } | undefined;
  return {
    token: cfg?.callback_token || FALLBACK_WECOM_CALLBACK_TOKEN,
    aesKey: cfg?.aes_key || FALLBACK_WECOM_AES_KEY,
    corpId: cfg?.corp_id || '',
  };
}

/** 按企微 UserID 反查销售名（用于回调里把 add 事件归属到销售）。 */
export function resolveSalesByWecomUserId(wecomUserid: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT sales_name FROM wecom_staff WHERE wecom_userid = ? LIMIT 1").get(wecomUserid) as { sales_name: string } | undefined;
  return row?.sales_name || null;
}

/** 按渠道活码 state 反查销售名。 */
export function resolveSalesByState(state: string): string | null {
  if (!state) return null;
  const db = getDb();
  const row = db.prepare("SELECT sales_name FROM wecom_contact_ways WHERE state = ? LIMIT 1").get(state) as { sales_name: string } | undefined;
  return row?.sales_name || null;
}

export function getWecomConfigs(): WecomConfig[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM wecom_config ORDER BY id").all() as WecomConfig[];
  return rows.map(r => ({ ...r, secret: '<hidden>' }));
}

export function saveWecomConfig(corpId: string, secret: string, label: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO wecom_config (corp_id, secret, label) VALUES (?, ?, ?) ON CONFLICT(corp_id) DO UPDATE SET secret = excluded.secret, label = excluded.label, updated_at = datetime('now','localtime')"
  ).run(corpId, encrypt(secret), label);
}

export function deleteWecomConfig(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM wecom_config WHERE id = ?").run(id);
}

// ---- staff CRUD ----

export function getWecomStaffList(): Array<WecomStaff & { label: string }> {
  const db = getDb();
  return db.prepare(
    "SELECT s.*, c.label FROM wecom_staff s JOIN wecom_config c ON s.config_id = c.id ORDER BY s.id"
  ).all() as Array<WecomStaff & { label: string }>;
}

export function saveWecomStaff(configId: number, salesName: string, wecomUserid: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO wecom_staff (config_id, sales_name, wecom_userid) VALUES (?, ?, ?)"
  ).run(configId, salesName, wecomUserid);
}

export function deleteWecomStaff(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM wecom_staff WHERE id = ?").run(id);
}

// ---- tracked contact-way QR codes ----

export function getWecomContactWays(): WecomContactWay[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM wecom_contact_ways ORDER BY created_at DESC"
  ).all() as WecomContactWay[];
}

function buildState(salesName: string, channel: string): string {
  const raw = `${channel || 'xczd'}_${salesName}`;
  return raw
    .replace(/[^\w\u4e00-\u9fa5-]/g, '_')
    .slice(0, 30);
}

export async function createWecomContactWay(
  staffId: number,
  channel = 'xczd',
): Promise<WecomContactWay> {
  const db = getDb();
  const staff = db.prepare(
    "SELECT s.*, c.id as config_id FROM wecom_staff s JOIN wecom_config c ON s.config_id = c.id WHERE s.id = ?"
  ).get(staffId) as (WecomStaff & { config_id: number }) | undefined;
  if (!staff) throw new Error('未找到企微员工配置');

  const token = await getAccessToken(staff.config_id);
  if (!token) throw new Error('获取企微 access_token 失败，请检查配置');

  const state = buildState(staff.sales_name, channel);
  const remark = `${channel || 'xczd'}-${staff.sales_name}`;
  const res = await fetch(`${WECOM_API_BASE}/cgi-bin/externalcontact/add_contact_way?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 1,
      scene: 2,
      remark,
      skip_verify: true,
      state,
      user: [staff.wecom_userid],
    }),
  });
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`生成企微二维码失败：${data.errmsg || data.errcode}`);
  }

  db.prepare(`
    INSERT INTO wecom_contact_ways
      (config_id, staff_id, sales_name, wecom_userid, state, remark, contact_way_config_id, qr_code, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(state) DO UPDATE SET
      config_id = excluded.config_id,
      staff_id = excluded.staff_id,
      sales_name = excluded.sales_name,
      wecom_userid = excluded.wecom_userid,
      remark = excluded.remark,
      contact_way_config_id = excluded.contact_way_config_id,
      qr_code = excluded.qr_code,
      status = 'active',
      updated_at = datetime('now','localtime')
  `).run(
    staff.config_id,
    staff.id,
    staff.sales_name,
    staff.wecom_userid,
    state,
    remark,
    data.config_id || '',
    data.qr_code || '',
  );

  return db.prepare("SELECT * FROM wecom_contact_ways WHERE state = ?").get(state) as WecomContactWay;
}

// ---- access token ----

interface TokenCache { token: string; expiresAt: number; corpId: string; }
const tokenCaches: Map<string, TokenCache> = new Map();

async function getAccessToken(configId: number): Promise<string | null> {
  const db = getDb();
  const config = db.prepare("SELECT * FROM wecom_config WHERE id = ?").get(configId) as WecomConfig | undefined;
  if (!config) return null;

  const cached = tokenCaches.get(config.corp_id);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const secret = decrypt(config.secret);
  const url = `${WECOM_API_BASE}/cgi-bin/gettoken?corpid=${config.corp_id}&corpsecret=${secret}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.access_token) {
    tokenCaches.set(config.corp_id, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
      corpId: config.corp_id,
    });
    return data.access_token;
  }
  return null;
}

// ---- external contact APIs ----

interface ExternalContactListResponse {
  errcode: number;
  errmsg: string;
  external_userid?: string[];
}

interface ExternalContactDetail {
  external_userid: string;
  name: string;
  type: number;
  gender: number;
  unionid: string;
  external_profile?: {
    corp_name?: string;
    wechat_channels?: { avatar?: string; nickname?: string };
  };
}

interface ExternalContactInfoResponse {
  errcode: number;
  errmsg: string;
  external_contact?: ExternalContactDetail;
  follow_user?: Array<{
    userid: string;
    remark: string;
    description: string;
    createtime: number;
    tags?: Array<{ group_name: string; tag_name: string }>;
    add_way: number;
    state: string;
  }>;
}

// ---- sync ----

export async function syncWecomContacts(): Promise<{
  bindings: number;
  error?: string;
}> {
  const db = getDb();
  const staffList = db.prepare(
    "SELECT s.*, c.corp_id FROM wecom_staff s JOIN wecom_config c ON s.config_id = c.id"
  ).all() as Array<WecomStaff & { corp_id: string }>;

  if (staffList.length === 0) {
    return { bindings: 0, error: '未配置企微员工，请先在企微设置中添加' };
  }

  const insertBinding = db.prepare(
    `INSERT OR IGNORE INTO wecom_bindings
      (order_id, sales_name, external_userid, contact_name, contact_phone, added_at, state, match_method, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let totalBindings = 0;

  // Group staff by config (同一企业的员工共享 access token)
  const byConfig = new Map<number, Array<WecomStaff & { corp_id: string }>>();
  for (const s of staffList) {
    const list = byConfig.get(s.config_id) || [];
    list.push(s);
    byConfig.set(s.config_id, list);
  }

  for (const [configId, staff] of byConfig) {
    const token = await getAccessToken(configId);
    if (!token) return { bindings: totalBindings, error: '获取企微 access_token 失败，请检查配置' };

    for (const s of staff) {
      // Step 1: Get external contact list
      const listUrl = `${WECOM_API_BASE}/cgi-bin/externalcontact/list?access_token=${token}&userid=${s.wecom_userid}`;
      const listRes = await fetch(listUrl);
      const listData: ExternalContactListResponse = await listRes.json();

      if (listData.errcode !== 0) {
        console.error('Failed to get external contact list for', s.sales_name, listData);
        continue;
      }

      const externalUserIds = listData.external_userid || [];
      if (externalUserIds.length === 0) continue;

      // Step 2: Batch get contact details (max 100 per request)
      const batchUrl = `${WECOM_API_BASE}/cgi-bin/externalcontact/batch/get_by_user?access_token=${token}`;
      for (let i = 0; i < externalUserIds.length; i += 100) {
        const batch = externalUserIds.slice(i, i + 100);
        const batchRes = await fetch(batchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userid: s.wecom_userid, cursor: '', limit: 100 }),
        });

        // The batch API returns contacts differently. Let's use individual get for each.
        // Actually the batch get_by_user returns all contacts for a user, not by explicit IDs.
        // Let's fetch individual details for each external_userid.
      }

      // Fetch individual contact details
      for (const eid of externalUserIds) {
        try {
          const detailUrl = `${WECOM_API_BASE}/cgi-bin/externalcontact/get?access_token=${token}&external_userid=${eid}`;
          const detailRes = await fetch(detailUrl);
          const detailData: ExternalContactInfoResponse = await detailRes.json();

          if (detailData.errcode !== 0 || !detailData.external_contact) continue;

          const contact = detailData.external_contact;
          const contactName = contact.name || '';

          // Extract phone from external_profile (if available — requires customer authorization)
          // Phone is not directly available via API; we rely on customer-provided info

          // Try to match by name with existing orders
          // First try exact name match, then fall back to phone from orders
          const followUser = detailData.follow_user?.find(f => f.userid === s.wecom_userid) || detailData.follow_user?.[0];
          const addedAt = followUser?.createtime
            ? new Date(followUser.createtime * 1000).toISOString().replace('T', ' ').slice(0, 19)
            : '';
          const state = followUser?.state || '';
          const matchMethod = state ? 'state_name_time' : 'name_time';
          const confidence = state ? 85 : 70;

          // Match by name to find orders within this sales person's time ranges
          if (contactName) {
            // Find matching orders by name in this sales person's assignment ranges
            const orders = db.prepare(`
              SELECT o.order_id, o.buyer_phone FROM wechat_orders o
              INNER JOIN sales_assignments sa ON sa.sales_name = ?
              WHERE o.buyer_name = ?
                AND o.create_time >= sa.start_time
                AND (sa.end_time IS NULL OR o.create_time <= sa.end_time)
            `).all(s.sales_name, contactName) as Array<{ order_id: string; buyer_phone: string }>;

            for (const o of orders) {
              insertBinding.run(o.order_id, s.sales_name, eid, contactName, o.buyer_phone, addedAt, state, matchMethod, confidence);
              totalBindings++;
            }
          }

          // Also try matching by phone from the contact (if we could get it)
          // WeChat Work API doesn't expose phone directly — this is best-effort name matching
        } catch (e) {
          console.error('Error fetching contact detail', eid, e);
        }
      }
    }
  }

  return { bindings: totalBindings };
}

// ---- bindings query ----

export function getWecomBindings(salesFilter?: string): Array<WecomBinding & { buyer_name: string; buyer_phone: string; product_names: string; create_time: string }> {
  const db = getDb();
  let query = `
    SELECT wb.*, wo.buyer_name, wo.buyer_phone, wo.product_names, wo.create_time
    FROM wecom_bindings wb
    JOIN wechat_orders wo ON wb.order_id = wo.order_id
  `;
  if (salesFilter) {
    query += ' WHERE wb.sales_name = ?';
    return db.prepare(query + ' ORDER BY wb.added_at DESC').all(salesFilter) as Array<WecomBinding & { buyer_name: string; buyer_phone: string; product_names: string; create_time: string }>;
  }
  return db.prepare(query + ' ORDER BY wb.added_at DESC').all() as Array<WecomBinding & { buyer_name: string; buyer_phone: string; product_names: string; create_time: string }>;
}

// ---- callback verification (for future use when deployed) ----

export function verifyCallbackSignature(
  token: string, timestamp: string, nonce: string, echostr: string, signature: string
): string | null {
  const arr = [token, timestamp, nonce, echostr].sort();
  const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex');
  if (hash === signature) return echostr;
  return null;
}
