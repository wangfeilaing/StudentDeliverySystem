import { getDb } from '@/lib/db';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function getSecretKey(): Buffer {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update('claude-code-ip-platform-feishu-doc').digest();
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

export function getFeishuCredentials(): { app_id: string; app_secret: string } | null {
  const db = getDb();
  const appId = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_app_id'").get() as { value: string } | undefined;
  const encSecret = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_app_secret'").get() as { value: string } | undefined;
  if (!appId?.value || !encSecret?.value) return null;
  return { app_id: appId.value, app_secret: decrypt(encSecret.value) };
}

export function saveFeishuCredentials(appId: string, appSecret: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('feishu_app_id', ?)").run(appId);
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('feishu_app_secret', ?)").run(encrypt(appSecret));
}

export function encryptFeishuSecret(secret: string): string {
  return encrypt(secret);
}

async function getTenantAccessToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const creds = getFeishuCredentials();
  if (!creds) return null;

  const res = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: creds.app_id, app_secret: creds.app_secret }),
  });
  const data = await res.json();
  if (data.code === 0 && data.tenant_access_token) {
    tokenCache = {
      token: data.tenant_access_token,
      expiresAt: Date.now() + (data.expire - 300) * 1000,
    };
    return tokenCache.token;
  }
  console.error('Failed to get Feishu tenant access token:', data);
  return null;
}

// 应用凭证（tenant token）是否可用。用于把「应用凭证坏了」和「用户未授权」
// 这两种都会导致读不到文档的原因区分开。
export async function hasTenantAccess(): Promise<boolean> {
  try {
    const token = await getTenantAccessToken();
    return !!token;
  } catch (e) {
    console.error('[feishu] tenant token 探测失败：', (e as Error).message);
    return false;
  }
}

// --- User access token (OAuth) management ---

interface UserTokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let userTokenCache: UserTokenCache | null = null;
let refreshPromise: Promise<string | null> | null = null;
let proactiveTimer: ReturnType<typeof setInterval> | null = null;
const REFRESH_LOCK_TIMEOUT = 30_000; // 30s max for a refresh operation
const REFRESH_LOCK_KEY = 'feishu_token_refreshing';

export function storeUserTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('feishu_user_access_token', ?)").run(encrypt(accessToken));
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('feishu_user_refresh_token', ?)").run(encrypt(refreshToken));
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('feishu_user_token_expires_at', ?)").run(String(Date.now() + expiresIn * 1000));

  userTokenCache = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
  startProactiveRefresh();
}

export function clearUserTokens(): void {
  const db = getDb();
  db.prepare("DELETE FROM system_settings WHERE key IN ('feishu_user_access_token', 'feishu_user_refresh_token', 'feishu_user_token_expires_at')").run();
  userTokenCache = null;
  stopProactiveRefresh();
}

function stopProactiveRefresh(): void {
  if (proactiveTimer) { clearInterval(proactiveTimer); proactiveTimer = null; }
}

function startProactiveRefresh(): void {
  if (proactiveTimer) return;
  // Refresh 30 min before the 2-hour token expires (every 90 min)
  proactiveTimer = setInterval(async () => {
    try {
      const token = await getUserAccessTokenInternal();
      if (!token) stopProactiveRefresh();
    } catch { /* silent — next interval will retry */ }
  }, 90 * 60 * 1000);
}

export function getUserTokenStatus(): { authorized: boolean; expiresAt: number | null } {
  const db = getDb();
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_token_expires_at'").get() as { value: string } | undefined;
  if (!row?.value) return { authorized: false, expiresAt: null };
  const expiresAt = parseInt(row.value, 10);
  if (Date.now() > expiresAt) {
    const rt = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_refresh_token'").get() as { value: string } | undefined;
    return { authorized: !!rt?.value, expiresAt };
  }
  return { authorized: true, expiresAt };
}

export type FeishuTokenState = 'ok' | 'not_authorized' | 'expired' | 'unreachable';

export interface FeishuTokenProbe {
  /** 只有真正拿得到可用 access_token 才为 true */
  usable: boolean;
  state: FeishuTokenState;
  /** 人类可读的原因，直接展示在系统设置页 */
  message: string;
  expiresAt: number | null;
  hasRefreshToken: boolean;
  /** 用于让前端判断是否需要重新授权 */
  needsReauth: boolean;
}

/**
 * 真正探测飞书用户令牌是否可用。
 *
 * getUserTokenStatus 只判断「过期时间字段是否还在 / refresh_token 是否存在」，
 * 令牌实际失效时仍会返回 authorized: true，页面上显示「已授权」但所有飞书调用
 * 都会静默失败（返回空文档）。这里改为真的尝试取一次令牌，把失败原因带回给调用方。
 */
export async function probeUserToken(): Promise<FeishuTokenProbe> {
  const db = getDb();
  const expiresRow = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_token_expires_at'").get() as { value: string } | undefined;
  const rtRow = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_refresh_token'").get() as { value: string } | undefined;
  const expiresAt = expiresRow?.value ? parseInt(expiresRow.value, 10) : null;
  const hasRefreshToken = !!rtRow?.value;

  if (!expiresAt && !hasRefreshToken) {
    return {
      usable: false, state: 'not_authorized', expiresAt: null, hasRefreshToken: false, needsReauth: true,
      message: '尚未授权飞书账号，请点击「授权飞书」完成一次 OAuth 授权。',
    };
  }

  // 已过期的令牌尝试刷新；这里能拿到 token 就说明刷新成功
  try {
    const token = await getUserAccessToken();
    if (token) {
      return {
        usable: true, state: 'ok', expiresAt, hasRefreshToken, needsReauth: false,
        message: '飞书授权有效，文档同步功能可用。',
      };
    }
  } catch (e) {
    console.error('[feishu] 令牌探测失败：', (e as Error).message);
  }

  // 刷新失败：refreshUserAccessToken 在 code=20026 时会调用 clearUserTokens()，
  // 所以这里重新读一次库，判断是否已经被清空。
  const stillHasRefresh = !!(db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_refresh_token'").get() as { value: string } | undefined)?.value;
  if (!stillHasRefresh) {
    return {
      usable: false, state: 'expired', expiresAt, hasRefreshToken: false, needsReauth: true,
      message: '飞书授权已失效（refresh_token 已被飞书拒绝），需要重新点击「授权飞书」。',
    };
  }
  return {
    usable: false, state: 'unreachable', expiresAt, hasRefreshToken: true, needsReauth: false,
    message: '暂时无法连接飞书换取令牌（网络或飞书接口异常），可稍后重试；若持续失败请重新授权。',
  };
}

// Try to load a valid access token from DB into cache — used as recovery path
// when another process did the refresh
function loadTokenFromDb(): string | null {
  const db = getDb();
  const encAccess = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_access_token'").get() as { value: string } | undefined;
  const expiresRow = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_token_expires_at'").get() as { value: string } | undefined;
  if (!encAccess?.value || !expiresRow?.value) return null;
  const expiresAt = parseInt(expiresRow.value, 10);
  if (Date.now() < expiresAt - 300_000) {
    try {
      const accessToken = decrypt(encAccess.value);
      userTokenCache = { accessToken, refreshToken: '', expiresAt };
      return accessToken;
    } catch { return null; }
  }
  return null;
}

// DB-level lock to prevent concurrent refresh across Next.js worker processes
function acquireRefreshLock(): boolean {
  const db = getDb();
  const existing = db.prepare(
    `SELECT value FROM system_settings WHERE key = ?`
  ).get(REFRESH_LOCK_KEY) as { value: string } | undefined;
  if (existing?.value) {
    const lockTime = parseInt(existing.value, 10);
    if (Date.now() - lockTime < REFRESH_LOCK_TIMEOUT) return false;
    // Stale lock — another process died mid-refresh
  }
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)").run(REFRESH_LOCK_KEY, String(Date.now()));
  return true;
}

function releaseRefreshLock(): void {
  getDb().prepare("DELETE FROM system_settings WHERE key = ?").run(REFRESH_LOCK_KEY);
}

async function refreshUserAccessToken(): Promise<string | null> {
  const db = getDb();
  const encRefresh = db.prepare("SELECT value FROM system_settings WHERE key = 'feishu_user_refresh_token'").get() as { value: string } | undefined;
  if (!encRefresh?.value) return null;

  let refreshToken: string;
  try { refreshToken = decrypt(encRefresh.value); }
  catch { clearUserTokens(); return null; }

  const creds = getFeishuCredentials();
  if (!creds) return null;

  const res = await fetch(`${FEISHU_API_BASE}/authen/v1/refresh_access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      app_id: creds.app_id,
      app_secret: creds.app_secret,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (data.code === 0 && data.data?.access_token) {
    const { access_token, refresh_token, expires_in } = data.data;
    storeUserTokens(access_token, refresh_token || refreshToken, expires_in || 7200);
    return access_token;
  }

  console.error('Failed to refresh user token:', data.code, data.msg);
  if (data.code === 20026) {
    clearUserTokens();
    stopProactiveRefresh();
  }
  return null;
}

// Internal: do the actual refresh without the DB lock (called by proactive refresh too)
async function getUserAccessTokenInternal(): Promise<string | null> {
  if (userTokenCache && Date.now() < userTokenCache.expiresAt - 300_000) {
    return userTokenCache.accessToken;
  }

  // Try DB first (might have been refreshed by another process)
  const fromDb = loadTokenFromDb();
  if (fromDb) return fromDb;

  // Acquire cross-process lock
  if (!acquireRefreshLock()) {
    // Another process is refreshing — wait and re-check DB
    await new Promise(r => setTimeout(r, 2000));
    return loadTokenFromDb() || getUserAccessTokenInternal();
  }

  try {
    return await refreshUserAccessToken();
  } finally {
    releaseRefreshLock();
  }
}

async function getUserAccessToken(): Promise<string | null> {
  // Return cached token if still valid
  if (userTokenCache && Date.now() < userTokenCache.expiresAt - 300_000) {
    return userTokenCache.accessToken;
  }

  // If a refresh is already in progress within THIS process, piggyback on it
  if (refreshPromise) return refreshPromise;

  refreshPromise = getUserAccessTokenInternal().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/**
 * 从飞书文档链接里解析出「文档 ID」。
 *
 * 两种链接形态要区分清楚：
 *   /docx/XXXX  —— XXXX 就是 docx document_id，可直接用于 docx 接口；
 *   /wiki/YYYY  —— YYYY 是知识库节点 token，**不是** document_id，直接拿去调
 *                  docx 接口会读不到任何块。
 * 因此在 wiki 形态下这里返回 null，调用方应改用数据库里已存的 document_id
 * （ip_feishu_docs.document_id 在创建文档时就记录了真正的 document_id）。
 */
export function parseDocumentId(url: string): string | null {
  const docx = url.match(/\/docx\/([A-Za-z0-9_-]+)/);
  if (docx) return docx[1];
  return null;
}

/** 链接是不是知识库（wiki）形态。 */
export function isWikiUrl(url: string): boolean {
  return /\/wiki\/[A-Za-z0-9_-]+/.test(url);
}

/**
 * 解析出可用于 docx 接口的文档 ID：优先用库里存的 document_id，
 * 其次才回退到链接解析（仅 /docx/ 形态可用）。
 */
export function resolveDocxId(url: string | null | undefined, storedDocumentId?: string | null): string | null {
  if (storedDocumentId) return storedDocumentId;
  if (!url) return null;
  return parseDocumentId(url);
}

async function createDocAndPopulate(
  token: string, title: string, children: Array<Record<string, unknown>>, folderToken?: string
): Promise<{ document_id: string; url: string } | null> {
  const body: Record<string, unknown> = { title };
  if (folderToken) body.folder_token = folderToken;

  const createRes = await fetch(`${FEISHU_API_BASE}/docx/v1/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const createData = await createRes.json();
  if (createData.code !== 0 || !createData.data?.document) {
    console.error('Feishu doc create failed:', JSON.stringify(createData));
    return null;
  }

  const docId = createData.data.document.document_id;
  const docUrl = `https://my.feishu.cn/docx/${docId}`;

  // Get the page block ID and populate children
  const blocksRes = await fetch(
    `${FEISHU_API_BASE}/docx/v1/documents/${docId}/blocks?page_size=10`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const blocksData = await blocksRes.json();
  const pageBlock = (blocksData.data?.items as Array<{ block_id: string; block_type: number }> | undefined)
    ?.find(b => b.block_type === 1);

  if (pageBlock && children.length > 0) {
    await fetch(`${FEISHU_API_BASE}/docx/v1/documents/${docId}/blocks/${pageBlock.block_id}/children`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ children, index: -1 }),
    });
  }

  return { document_id: docId, url: docUrl };
}

// Create a new Feishu Doc with the given title and initial blocks
// folderToken: the folder node token to place the doc in (works with My Space folders and wiki nodes)
export async function createFeishuDoc(
  title: string,
  children: Array<Record<string, unknown>>,
  folderToken?: string,
): Promise<{ document_id: string; url: string; warning?: string } | null> {
  try {
    const tenantToken = await getTenantAccessToken();
    if (!tenantToken) return null;

    // Try with folder_token first
    if (folderToken) {
      // Try tenant token first, then user token as fallback (wiki nodes need user token)
      let result = await createDocAndPopulate(tenantToken, title, children, folderToken);
      if (!result) {
        const userToken = await getUserAccessToken();
        if (userToken) {
          console.log('Retrying doc creation with user access token for wiki folder_token');
          result = await createDocAndPopulate(userToken, title, children, folderToken);
        }
      }
      if (result) return result;
      console.warn('Feishu doc creation with folder_token failed, retrying without it. Check app permissions.');
    }

    // Fallback: create without folder_token
    return await createDocAndPopulate(tenantToken, title, children);
  } catch (e) {
    console.error('createFeishuDoc error:', e);
    return null;
  }
}

// Inline text style from Feishu API
export interface TextRunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  link?: { url: string };
}

export interface TextElement {
  text_run: {
    content: string;
    text_element_style?: TextRunStyle;
  };
}

// Pull all blocks from a Feishu doc
export interface FeishuBlockItem {
  block_id: string; block_type: number;
  text?: { elements: TextElement[] };
  heading1?: { elements: TextElement[] };
  heading2?: { elements: TextElement[] };
  heading3?: { elements: TextElement[] };
  heading4?: { elements: TextElement[] };
  heading5?: { elements: TextElement[] };
  heading6?: { elements: TextElement[] };
  heading7?: { elements: TextElement[] };
  heading8?: { elements: TextElement[] };
  heading9?: { elements: TextElement[] };
  bullet?: { elements: TextElement[] };
  ordered?: { elements: TextElement[] };
  code?: { elements: TextElement[]; style?: { language?: number } };
  quote?: { elements: TextElement[] };
  callout?: { elements: TextElement[] };
  image?: { width: number; height: number; token: string };
  divider?: Record<string, never>;
  grid?: { column_size?: number };
  column?: { width_ratio?: number };
  children?: string[];
}

// Extract elements from any block type
function getBlockElements(block: FeishuBlockItem): TextElement[] | null {
  return (
    block.text?.elements ||
    block.heading1?.elements ||
    block.heading2?.elements ||
    block.heading3?.elements ||
    block.heading4?.elements ||
    block.heading5?.elements ||
    block.heading6?.elements ||
    block.heading7?.elements ||
    block.heading8?.elements ||
    block.heading9?.elements ||
    block.bullet?.elements ||
    block.ordered?.elements ||
    block.code?.elements ||
    block.quote?.elements ||
    block.callout?.elements ||
    null
  );
}

export async function getFeishuDocBlocks(documentId: string): Promise<FeishuBlockItem[]> {
  try {
    const token = await getTenantAccessToken();
    if (!token) return [];

    const allBlocks: FeishuBlockItem[] = [];
    let pageToken: string | null = null;

    do {
      const fetchUrl = `${FEISHU_API_BASE}/docx/v1/documents/${documentId}/blocks?page_size=500${pageToken ? `&page_token=${pageToken}` : ''}`;
      const res: Response = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${token}` } });
      const data: { code: number; data?: { items?: FeishuBlockItem[]; page_token?: string; has_more?: boolean } } = await res.json();
      if (data.code === 0 && data.data?.items) {
        allBlocks.push(...(data.data.items as FeishuBlockItem[]));
        pageToken = data.data.page_token || null;
      } else {
        break;
      }
    } while (pageToken);

    return allBlocks;
  } catch (e) {
    console.error('getFeishuDocBlocks error:', e);
    return [];
  }
}

// Extract plain text from a block's elements (no formatting)
function blockPlainText(block: FeishuBlockItem): string {
  const elements = getBlockElements(block);
  if (!elements) return '';
  return elements.map(e => e.text_run?.content || '').join('');
}

// Convert blocks to plain text grouped by H1 headings
export interface DocSection {
  heading: string;
  content: string;
  blockId: string;
}
export function blocksToSections(blocks: FeishuBlockItem[]): DocSection[] {
  const sections: DocSection[] = [];
  let currentSection: DocSection | null = null;

  for (const block of blocks) {
    if (block.block_type === 3) { // H1 = type 3
      if (currentSection) sections.push(currentSection);
      currentSection = { heading: blockPlainText(block), content: '', blockId: block.block_id };
    } else if (currentSection) {
      const text = blockPlainText(block);
      if (text) currentSection.content += text + '\n';
    }
  }
  if (currentSection) sections.push(currentSection);
  return sections;
}

export interface DocSectionMarkdown {
  heading: string;
  markdown: string;
  blockId: string;
}

// Convert blocks to per-section Markdown (grouped by H1), using the block tree
export function blocksToSectionsMarkdown(blocks: FeishuBlockItem[]): DocSectionMarkdown[] {
  const blockMap = new Map<string, FeishuBlockItem>();
  for (const b of blocks) blockMap.set(b.block_id, b);

  const rootPage = blocks.find(b => b.block_type === 1);
  if (!rootPage?.children) return [];

  const sections: DocSectionMarkdown[] = [];
  let currentHeading = '';
  let currentBlockId = '';
  let currentChildIds: string[] = [];

  for (const childId of rootPage.children) {
    const block = blockMap.get(childId);
    if (!block) continue;

    if (block.block_type === 3) {
      // Save previous section
      if (currentBlockId && currentChildIds.length > 0) {
        const md = renderBlocksToMarkdown(currentChildIds, blockMap, 0);
        sections.push({ heading: currentHeading, markdown: md, blockId: currentBlockId });
      }
      currentHeading = blockPlainText(block);
      currentBlockId = block.block_id;
      currentChildIds = block.children || [];
    }
  }
  // Last section
  if (currentBlockId) {
    const md = renderBlocksToMarkdown(currentChildIds, blockMap, 0);
    sections.push({ heading: currentHeading, markdown: md, blockId: currentBlockId });
  }

  return sections;
}

// Render inline elements with Markdown formatting
function renderInlineMarkdown(elements: TextElement[]): string {
  return elements.map(e => {
    const content = e.text_run?.content || '';
    const style = e.text_run?.text_element_style;
    if (!style) return content;

    let text = content;
    if (style.bold) text = `**${text}**`;
    if (style.italic) text = `*${text}*`;
    if (style.strikethrough) text = `~~${text}~~`;
    if (style.inline_code) text = '`' + text + '`';
    if (style.underline) text = `<u>${text}</u>`;
    if (style.link?.url) text = `[${text}](${style.link.url})`;
    return text;
  }).join('');
}

// Recursively render blocks to Markdown
function renderBlocksToMarkdown(
  blockIds: string[],
  blockMap: Map<string, FeishuBlockItem>,
  depth: number,
): string {
  if (depth > 10) return ''; // safety limit

  const lines: string[] = [];
  for (const id of blockIds) {
    const block = blockMap.get(id);
    if (!block) continue;

    const elements = getBlockElements(block);
    const inlineText = elements ? renderInlineMarkdown(elements) : '';
    const children = block.children;

    switch (block.block_type) {
      case 1: // Page
        if (children) lines.push(renderBlocksToMarkdown(children, blockMap, depth + 1));
        break;
      case 2: // Text
        if (inlineText) lines.push(inlineText);
        break;
      case 3: // H1
        if (inlineText) lines.push('# ' + inlineText);
        break;
      case 4: // H2
        if (inlineText) lines.push('## ' + inlineText);
        break;
      case 5: // H3
        if (inlineText) lines.push('### ' + inlineText);
        break;
      case 6: case 7: case 8: case 9: case 10: case 11: // H4-H9
        if (inlineText) lines.push('#### ' + inlineText);
        break;
      case 13: // Bullet
        if (inlineText) lines.push('- ' + inlineText);
        break;
      case 14: // Ordered
        if (inlineText) lines.push('1. ' + inlineText);
        break;
      case 15: // Code
        if (inlineText) lines.push('```\n' + inlineText + '\n```');
        break;
      case 16: // Quote
        if (inlineText) lines.push('> ' + inlineText);
        break;
      case 19: // Callout
        if (inlineText) lines.push('> ' + inlineText);
        break;
      case 27: // Image
        if (block.image?.token) lines.push(`![image](${block.image.token})`);
        break;
      case 24: // Grid
      case 25: // Column
        if (children) lines.push(renderBlocksToMarkdown(children, blockMap, depth + 1));
        break;
      default:
        // Unknown block types — still recurse children if any
        if (children) lines.push(renderBlocksToMarkdown(children, blockMap, depth + 1));
        break;
    }
  }

  return lines.join('\n');
}

// Convert blocks to formatted Markdown string
export function blocksToMarkdown(blocks: FeishuBlockItem[]): string {
  const blockMap = new Map<string, FeishuBlockItem>();
  for (const b of blocks) blockMap.set(b.block_id, b);

  const rootPage = blocks.find(b => b.block_type === 1);
  if (rootPage?.children) {
    return renderBlocksToMarkdown(rootPage.children, blockMap, 0);
  }
  // Fallback: render all top-level blocks in order (no page block)
  return blocks
    .filter(b => b.block_type !== 1)
    .map(b => {
      const elements = getBlockElements(b);
      if (!elements) return '';
      return renderInlineMarkdown(elements);
    })
    .filter(Boolean)
    .join('\n');
}

// Convert Markdown to Feishu text elements with inline styles
export function markdownToFeishuElements(md: string): TextElement[] {
  if (!md) return [{ text_run: { content: ' ' } }];

  // Parse a single line of inline markdown into styled text_runs
  function parseInline(text: string): Array<{ content: string; style?: TextRunStyle }> {
    const segments: Array<{ content: string; style?: TextRunStyle }> = [];
    let i = 0;

    while (i < text.length) {
      // Bold **text**
      if (text[i] === '*' && text[i + 1] === '*' && text[i + 2] !== ' ') {
        const end = text.indexOf('**', i + 2);
        if (end !== -1) {
          const inner = parseInline(text.slice(i + 2, end));
          for (const seg of inner) {
            segments.push({ content: seg.content, style: { ...seg.style, bold: true } });
          }
          i = end + 2;
          continue;
        }
      }
      // Italic *text* (single asterisk, not followed by space)
      if (text[i] === '*' && text[i + 1] !== '*' && text[i + 1] !== ' ' && text[i + 1] !== undefined) {
        const end = text.indexOf('*', i + 1);
        if (end !== -1 && end > i + 1) {
          const inner = parseInline(text.slice(i + 1, end));
          for (const seg of inner) {
            segments.push({ content: seg.content, style: { ...seg.style, italic: true } });
          }
          i = end + 1;
          continue;
        }
      }
      // Strikethrough ~~text~~
      if (text[i] === '~' && text[i + 1] === '~') {
        const end = text.indexOf('~~', i + 2);
        if (end !== -1) {
          const inner = parseInline(text.slice(i + 2, end));
          for (const seg of inner) {
            segments.push({ content: seg.content, style: { ...seg.style, strikethrough: true } });
          }
          i = end + 2;
          continue;
        }
      }
      // Inline code `text`
      if (text[i] === '`') {
        const end = text.indexOf('`', i + 1);
        if (end !== -1) {
          segments.push({ content: text.slice(i + 1, end), style: { inline_code: true } });
          i = end + 1;
          continue;
        }
      }
      // Link [text](url)
      if (text[i] === '[') {
        const closeBracket = text.indexOf('](', i + 1);
        if (closeBracket !== -1) {
          const closeParen = text.indexOf(')', closeBracket + 2);
          if (closeParen !== -1) {
            const linkText = text.slice(i + 1, closeBracket);
            const url = text.slice(closeBracket + 2, closeParen);
            segments.push({ content: linkText, style: { link: { url } } });
            i = closeParen + 1;
            continue;
          }
        }
      }
      // Underline <u>text</u>
      if (text[i] === '<' && text.slice(i, i + 3) === '<u>') {
        const end = text.indexOf('</u>', i + 3);
        if (end !== -1) {
          const inner = parseInline(text.slice(i + 3, end));
          for (const seg of inner) {
            segments.push({ content: seg.content, style: { ...seg.style, underline: true } });
          }
          i = end + 4;
          continue;
        }
      }

      // Plain text — collect until next special char
      let j = i;
      while (j < text.length && text[j] !== '*' && text[j] !== '~' && text[j] !== '`' && text[j] !== '[' && text[j] !== '<') {
        j++;
      }
      if (j > i) {
        segments.push({ content: text.slice(i, j) });
        i = j;
      } else {
        // Stuck on a special char we couldn't parse
        segments.push({ content: text[i] });
        i++;
      }
    }

    return segments;
  }

  // Split by double-newline into paragraphs, then by single newlines
  const paragraphs = md.split(/\n\n+/);
  const elements: TextElement[] = [];

  for (let p = 0; p < paragraphs.length; p++) {
    if (p > 0) {
      // Add paragraph separator
      elements.push({ text_run: { content: '\n' } });
    }
    const lines = paragraphs[p].split('\n');
    for (let l = 0; l < lines.length; l++) {
      if (l > 0) {
        elements.push({ text_run: { content: '\n' } });
      }
      const line = lines[l];
      if (!line) {
        if (elements.length === 0) elements.push({ text_run: { content: ' ' } });
        continue;
      }
      const segments = parseInline(line);
      for (const seg of segments) {
        const tr: { content: string; text_element_style?: TextRunStyle } = { content: seg.content };
        if (seg.style) tr.text_element_style = seg.style;
        elements.push({ text_run: tr });
      }
    }
  }

  if (elements.length === 0) {
    elements.push({ text_run: { content: ' ' } });
  }

  return elements;
}

// Update a single block's text content
export async function updateFeishuDocBlock(
  documentId: string, blockId: string, newContent: string
): Promise<boolean> {
  try {
    const token = await getTenantAccessToken();
    if (!token) return false;

    const elements = newContent.split('\n').filter(l => l.trim() || newContent === '\n').map(line => ({
      text_run: { content: line || ' ' },
    }));
    // Flatten: join with newline text_runs
    const flatElements: Array<{ text_run: { content: string } }> = [];
    newContent.split('\n').forEach((line, i) => {
      if (i > 0) flatElements.push({ text_run: { content: '\n' } });
      if (line) flatElements.push({ text_run: { content: line } });
    });

    const res = await fetch(
      `${FEISHU_API_BASE}/docx/v1/documents/${documentId}/blocks/${blockId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_text_elements: { elements: flatElements.length > 0 ? flatElements : [{ text_run: { content: ' ' } }] },
        }),
      },
    );
    const data = await res.json();
    return data.code === 0;
  } catch (e) {
    console.error('updateFeishuDocBlock error:', e);
    return false;
  }
}

// Update a block with formatted Markdown content (preserves inline styles)
export async function updateFeishuDocBlockFormatted(
  documentId: string, blockId: string, markdown: string
): Promise<boolean> {
  try {
    const token = await getTenantAccessToken();
    if (!token) return false;

    const elements = markdownToFeishuElements(markdown);

    const res = await fetch(
      `${FEISHU_API_BASE}/docx/v1/documents/${documentId}/blocks/${blockId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_text_elements: { elements },
        }),
      },
    );
    const data = await res.json();
    return data.code === 0;
  } catch (e) {
    console.error('updateFeishuDocBlockFormatted error:', e);
    return false;
  }
}

// Generate template blocks for a new 19800 IP document
export function generate19800Template(ipName: string): Array<Record<string, unknown>> {
  const stages = [
    { name: '阶段一：项目启动&信息前采', tasks: ['2v1项目启动会', '填写信息前采表'] },
    { name: '阶段二：竞品调研&精准定位', tasks: ['竞品调研', '4合1定位文档'] },
    { name: '阶段三：高效获客体系搭建', tasks: ['账号健康检查+养号', '打磨账号4件套', 'IP服化道+内容封面', '15条选题库搭建'] },
    { name: '阶段四：15条精准获客内容全包做', tasks: ['15条获客文案逐字打磨', '15条短视频剪辑成片', '发布节奏规划+数据复盘'] },
    { name: '阶段五：核心高客单爆品打磨', tasks: ['产品方案确认', '产品海报DEMO', '产品海报设计'] },
    { name: '阶段六：高成交私域体系布局', tasks: ['朋友圈规划&15条文案', '10次1v1成交指导'] },
    { name: '阶段七：全年陪跑深度赋能', tasks: ['战略纠偏会（共6场）', '作品拉片拆解会（共12场）', '销售谈单拆解会（共6场）'] },
  ];

  const blocks: Array<Record<string, unknown>> = [];
  for (const stage of stages) {
    blocks.push({
      block_type: 3, // H1
      heading1: { elements: [{ text_run: { content: stage.name } }], style: {} },
    });
    for (const task of stage.tasks) {
      blocks.push({
        block_type: 13, // bullet list
        bullet: { elements: [{ text_run: { content: `${task}` } }], style: {} },
      });
      blocks.push({
        block_type: 2, // text
        text: { elements: [{ text_run: { content: '记录：' } }], style: {} },
      });
    }
    blocks.push({
      block_type: 2,
      text: { elements: [{ text_run: { content: '' } }], style: {} },
    });
  }
  return blocks;
}

export async function appendCompletionToFeishuDoc(
  feishuDocUrl: string,
  taskName: string,
  completionDate: string,
  completedByName: string,
  completionNote: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 知识库（wiki）链接里是节点 token，不是文档 ID，先查库里的映射
    let documentId = parseDocumentId(feishuDocUrl);
    if (!documentId) {
      const row = getDb().prepare(
        "SELECT document_id FROM ip_feishu_docs WHERE feishu_doc_url = ? LIMIT 1"
      ).get(feishuDocUrl) as { document_id: string } | undefined;
      documentId = row?.document_id || null;
    }
    if (!documentId) return { success: false, error: '无法解析飞书文档ID（知识库链接请先创建文档映射）' };

    const token = await getTenantAccessToken();
    if (!token) return { success: false, error: '无法获取飞书 access token，请检查应用凭证配置' };

    // Get blocks to find the page root block
    const blocksRes = await fetch(
      `${FEISHU_API_BASE}/docx/v1/documents/${documentId}/blocks?page_size=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const blocksData = await blocksRes.json();
    if (blocksData.code !== 0) {
      return { success: false, error: `获取飞书文档结构失败: ${blocksData.msg}` };
    }

    // Find the page block (block_type === 1)
    const pageBlock = (blocksData.data?.items as Array<{ block_id: string; block_type: number }> | undefined)
      ?.find(b => b.block_type === 1);
    const pageBlockId = pageBlock?.block_id;
    if (!pageBlockId) return { success: false, error: '无法找到文档页面根节点' };

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Build completion record blocks
    const children: Array<Record<string, unknown>> = [
      {
        block_type: 3,
        heading2: {
          elements: [{ text_run: { content: `【交付完成】${taskName}` } }],
          style: {},
        },
      },
      {
        block_type: 2,
        text: {
          elements: [{ text_run: { content: `完成时间：${completionDate}` } }],
          style: {},
        },
      },
      {
        block_type: 2,
        text: {
          elements: [{ text_run: { content: `完成人：${completedByName}` } }],
          style: {},
        },
      },
    ];

    if (completionNote) {
      children.push({
        block_type: 2,
        text: {
          elements: [{ text_run: { content: `备注：${completionNote}` } }],
          style: {},
        },
      });
    }

    children.push({
      block_type: 2,
      text: {
        elements: [{ text_run: { content: `系统同步时间：${now}` } }],
        style: {},
      },
    });

    // POST to add children blocks at the end (index: -1)
    const patchRes = await fetch(
      `${FEISHU_API_BASE}/docx/v1/documents/${documentId}/blocks/${pageBlockId}/children`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ children, index: -1 }),
      },
    );
    const patchData = await patchRes.json();
    if (patchData.code !== 0) {
      return { success: false, error: `写入飞书文档失败: ${patchData.msg}` };
    }

    return { success: true };
  } catch (e) {
    console.error('Feishu sync error:', e);
    return { success: false, error: (e as Error).message };
  }
}

// ========== Batch document creation for 19800 product ==========

const WIKI_SPACE_ID = '7581141395209981152';
const WIKI_PARENT_NODE = 'SS6QwHXfiiqzS6k7KRtcPKvinef';

interface TemplateConfig {
  name: string;
  objToken: string;
  objType: 'docx' | 'sheet';
  sortOrder: number;
}

export const DELIVERY_TEMPLATES: TemplateConfig[] = [
  { name: '交付流程总览', objToken: 'DEMO_DOC_TOKEN_01', objType: 'docx', sortOrder: 1 },
  { name: '信息前采表', objToken: 'DEMO_DOC_TOKEN_02', objType: 'docx', sortOrder: 2 },
  { name: '竞品调研', objToken: 'DEMO_DOC_TOKEN_03', objType: 'sheet', sortOrder: 3 },
  { name: '4合1定位文档', objToken: 'DEMO_DOC_TOKEN_04', objType: 'docx', sortOrder: 4 },
  { name: '产品海报DEMO', objToken: 'DEMO_DOC_TOKEN_05', objType: 'sheet', sortOrder: 5 },
  { name: '账号策划选题会', objToken: 'DEMO_DOC_TOKEN_06', objType: 'docx', sortOrder: 6 },
  { name: '朋友圈规划&15条文案', objToken: 'DEMO_DOC_TOKEN_07', objType: 'docx', sortOrder: 7 },
];

async function copyFeishuFile(
  templateObjToken: string,
  newName: string,
  objType: 'docx' | 'sheet',
  token: string,
): Promise<{ fileToken: string; driveUrl: string } | null> {
  const copyRes = await fetch(`${FEISHU_API_BASE}/drive/v1/files/${templateObjToken}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName, type: objType, folder_token: '' }),
  });
  const copyData = await copyRes.json();
  feishuLog(`copyFeishuFile(${objType}): code=${copyData.code} msg=${copyData.msg} token=${copyData.data?.file?.token || copyData.data?.spreadsheet?.token || 'N/A'}`);
  if (copyData.code !== 0 || !copyData.data?.file?.token) {
    console.error('Copy template failed:', JSON.stringify(copyData));
    return null;
  }
  return {
    fileToken: copyData.data.file.token,
    driveUrl: copyData.data.file.url || `https://bytedance.feishu.cn/${objType}/${copyData.data.file.token}`,
  };
}

// Read all data from a template sheet and write it to the target copy.
// Drive copy API is async and may not preserve cell content, so we explicitly copy data.
async function copySheetContent(
  templateToken: string,
  targetToken: string,
  token: string,
): Promise<boolean> {
  try {
    // 1. Get template metainfo
    const tMetaRes = await fetch(`${FEISHU_API_BASE}/sheets/v2/spreadsheets/${templateToken}/metainfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tMeta = await tMetaRes.json();
    if (tMeta.code !== 0) { feishuLog(`copySheetContent template metainfo failed: ${tMeta.code}`); return false; }
    const tSheets = (tMeta.data?.sheets || []) as Array<{ sheetId: string; title: string }>;

    // 2. Get target metainfo (sheetIds differ from template after Drive copy)
    const targetMetaRes = await fetch(`${FEISHU_API_BASE}/sheets/v2/spreadsheets/${targetToken}/metainfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const targetMeta = await targetMetaRes.json();
    if (targetMeta.code !== 0) { feishuLog(`copySheetContent target metainfo failed: ${targetMeta.code}`); return false; }
    const targetSheets = (targetMeta.data?.sheets || []) as Array<{ sheetId: string; title: string }>;

    feishuLog(`copySheetContent: template ${tSheets.length} sheets, target ${targetSheets.length} sheets`);

    // 3. For each template sheet, read values and write to corresponding target sheet
    for (let i = 0; i < tSheets.length && i < targetSheets.length; i++) {
      const tSheet = tSheets[i];
      const tSheetId = (tSheet as any).sheetId || (tSheet as any).sheet_id;
      const targetSheetId = (targetSheets[i] as any).sheetId || (targetSheets[i] as any).sheet_id;

      // Read values from template
      const readRes = await fetch(
        `${FEISHU_API_BASE}/sheets/v2/spreadsheets/${templateToken}/values/${encodeURIComponent(tSheetId)}?valueRenderOption=ToString`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const readData = await readRes.json();
      const valueRange = readData.data?.valueRange || readData.data?.value_range;
      if (readData.code !== 0 || !valueRange?.values?.length) {
        feishuLog(`copySheetContent read sheet[${i}] "${tSheet.title}": code=${readData.code} — skipping`);
        continue;
      }

      const values = valueRange.values;
      feishuLog(`copySheetContent read sheet[${i}] "${tSheet.title}": ${values.length} rows`);

      // Clean values: replace embedded image objects with empty string, null → empty string
      const cleaned = values.map((row: any[]) => row.map((cell: any) => {
        if (cell === null || cell === undefined) return '';
        if (Array.isArray(cell) && cell.length > 0 && cell[0]?.type === 'embed-image') return '';
        return cell;
      }));

      // Build range using target's sheetId and the row/col count from the data
      const colCount = cleaned.reduce((max: number, row: any[]) => Math.max(max, row.length), 0);
      const lastCol = colCount > 0 ? String.fromCharCode(64 + Math.min(colCount, 26)) : 'A';
      const writeRange = `${targetSheetId}!A1:${lastCol}${cleaned.length}`;

      // Write to target
      const writeRes = await fetch(`${FEISHU_API_BASE}/sheets/v2/spreadsheets/${targetToken}/values`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valueRange: { range: writeRange, values: cleaned },
        }),
      });
      const writeData = await writeRes.json();
      feishuLog(`copySheetContent write sheet[${i}]: range=${writeRange} code=${writeData.code} msg=${writeData.msg}`);
    }
    return true;
  } catch (e) {
    feishuLog(`copySheetContent error: ${(e as Error).message}`);
    return false;
  }
}

function feishuLog(msg: string): void {
  const fs = require('fs');
  const logFile = '/Users/feiliang/Desktop/Claude Code/feishu-debug.log';
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* ignore */ }
}

// Create a docx directly in the wiki by cloning template blocks
// Uses POST /docx/v1/documents with folder_token (not the wiki API which returns false success)
async function cloneDocxToWiki(
  templateObjToken: string,
  newName: string,
  userToken: string,
  folderToken?: string,
): Promise<{ documentId: string; wikiUrl: string } | null> {
  const effectiveFolder = folderToken || WIKI_PARENT_NODE;
  feishuLog(`cloneDocxToWiki: template=${templateObjToken} name=${newName} folder=${effectiveFolder}`);

  // 1. Read all blocks from the template
  const allBlocks = await getFeishuDocBlocks(templateObjToken);
  if (!allBlocks.length) { feishuLog('  FAIL: template has no blocks'); return null; }

  const pageBlock = allBlocks.find(b => b.block_type === 1);
  if (!pageBlock) { feishuLog('  FAIL: no page block'); return null; }

  const blockMap = new Map(allBlocks.map(b => [b.block_id, b]));
  const contentKeys = ['text', 'heading1', 'heading2', 'heading3', 'heading4',
    'heading5', 'heading6', 'heading7', 'heading8', 'heading9',
    'bullet', 'ordered', 'code', 'quote', 'callout', 'divider',
    'image', 'table', 'grid', 'task', 'todo'];
  const CONTAINER_TYPES = new Set([1, 15, 16, 19]); // types that may keep children in create API
  const UNSUPPORTED_TYPES = new Set([30]);

  // Step 1: build flat→tree by converting children IDs to nested objects
  function buildTree(block: FeishuBlockItem): Record<string, unknown> | null {
    if (UNSUPPORTED_TYPES.has(block.block_type)) return null;
    const result: Record<string, unknown> = { block_type: block.block_type };
    const raw = block as unknown as Record<string, unknown>;
    for (const key of contentKeys) {
      if (raw[key]) result[key] = raw[key];
    }
    if (block.children?.length) {
      result.children = block.children
        .map(id => blockMap.get(id))
        .filter((b): b is FeishuBlockItem => !!b)
        .map(child => buildTree(child))
        .filter((b): b is Record<string, unknown> => !!b);
    }
    return result;
  }

  // Step 2: sanitize for the create API.
  // Grid (24) and column (25) blocks cannot be created — flatten them to their content.
  // Non-container blocks must not have children.
  function sanitizeTree(block: Record<string, unknown>): Record<string, unknown>[] {
    const bt = block.block_type as number;

    // Grid (24) and column (25): discard the wrapper, keep only content recursively
    if (bt === 24 || bt === 25) {
      const kids = block.children as Record<string, unknown>[] | undefined;
      if (!kids?.length) return [];
      return kids.flatMap(c => sanitizeTree(c));
    }

    // Clean the block: only keep block_type + content keys (+ children for containers)
    const cleaned: Record<string, unknown> = { block_type: bt };
    for (const key of contentKeys) {
      if (block[key]) cleaned[key] = block[key];
    }
    if (CONTAINER_TYPES.has(bt) && Array.isArray(block.children) && block.children.length > 0) {
      cleaned.children = (block.children as Record<string, unknown>[]).flatMap(c => sanitizeTree(c));
    }
    return [cleaned];
  }

  const rawChildren = (pageBlock.children || [])
    .map(id => blockMap.get(id))
    .filter((b): b is FeishuBlockItem => !!b)
    .map(block => buildTree(block))
    .filter((b): b is Record<string, unknown> => !!b);

  const children = rawChildren.flatMap(block => sanitizeTree(block));
  feishuLog(`  Blocks to copy: ${children.length} top-level`);

  // 2. Create new doc directly in wiki via folder_token
  const createRes = await fetch(`${FEISHU_API_BASE}/docx/v1/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newName, folder_token: effectiveFolder }),
  });
  const createData = await createRes.json();
  feishuLog(`  Create doc response: code=${createData.code} msg=${createData.msg}`);
  if (createData.code !== 0 || !createData.data?.document?.document_id) {
    feishuLog(`  FAIL: could not create doc in wiki`);
    return null;
  }

  const newDocId = createData.data.document.document_id;
  const wikiUrl = createData.data.document.url || `https://my.feishu.cn/wiki/${newDocId}`;
  feishuLog(`  Created: docId=${newDocId} url=${wikiUrl}`);

  // 3. Populate the new doc with template blocks
  if (children.length > 0) {
    feishuLog(`  Sending ${children.length} blocks`);
    try {
      const newBlocksRes = await fetch(
        `${FEISHU_API_BASE}/docx/v1/documents/${newDocId}/blocks?page_size=10`,
        { headers: { Authorization: `Bearer ${userToken}` } },
      );
      const newBlocksData = await newBlocksRes.json();
      const newPageBlock = (newBlocksData.data?.items as Array<{ block_id: string; block_type: number }> | undefined)
        ?.find(b => b.block_type === 1);

      if (newPageBlock) {
        const BATCH_SIZE = 50;
        let allOk = true;
        for (let start = 0; start < children.length; start += BATCH_SIZE) {
          const batch = children.slice(start, Math.min(start + BATCH_SIZE, children.length));
          const patchRes = await fetch(
            `${FEISHU_API_BASE}/docx/v1/documents/${newDocId}/blocks/${newPageBlock.block_id}/children`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ children: batch, index: -1 }),
            },
          );
          const patchData = await patchRes.json();
          const batchNum = Math.floor(start / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(children.length / BATCH_SIZE);
          feishuLog(`  Populate batch ${batchNum}/${totalBatches} (${batch.length} blocks): code=${patchData.code} ${patchData.msg || ''}`);
          if (patchData.code !== 0) {
            allOk = false;
            feishuLog(`  FAIL SAMPLE: ${JSON.stringify(batch[0]).substring(0, 400)}`);
          }
        }
        if (allOk) feishuLog(`  All ${Math.ceil(children.length / BATCH_SIZE)} batches OK`);
      }
    } catch (populateErr) {
      feishuLog(`  Populate error (doc already created): ${(populateErr as Error).message}`);
    }
  }

  return { documentId: newDocId, wikiUrl };
}

/** Create a wiki shortcut node pointing to a Drive document */
async function createWikiShortcut(
  objType: string,
  originToken: string,
  title: string,
  parentNodeToken: string,
  userToken: string,
): Promise<{ nodeToken: string; wikiUrl: string } | null> {
  try {
    const res = await fetch(`${FEISHU_API_BASE}/wiki/v2/spaces/${WIKI_SPACE_ID}/nodes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        obj_type: objType,
        parent_node_token: parentNodeToken,
        node_type: 'origin',
        origin_node_token: originToken,
        title,
      }),
    });
    const data = await res.json();
    feishuLog(`  createWikiShortcut: code=${data.code} msg=${data.msg}`);
    if (data.code !== 0 || !data.data?.node) return null;
    return {
      nodeToken: data.data.node.node_token,
      wikiUrl: data.data.node.url || `https://my.feishu.cn/wiki/${data.data.node.obj_token}`,
    };
  } catch (e) {
    feishuLog(`  createWikiShortcut error: ${(e as Error).message}`);
    return null;
  }
}

/** Look up a document's wiki node token by listing children of the parent wiki node */
async function getDocWikiNode(
  docObjToken: string,
  parentNodeToken: string,
  userToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${FEISHU_API_BASE}/wiki/v2/spaces/${WIKI_SPACE_ID}/nodes?parent_node_token=${parentNodeToken}&page_size=50`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    const data = await res.json();
    if (data.code !== 0 || !data.data?.items) return null;
    const found = (data.data.items as Array<{ node_token: string; obj_token: string }>)
      .find((n: { node_token: string; obj_token: string }) => n.obj_token === docObjToken);
    return found?.node_token || null;
  } catch {
    return null;
  }
}

export interface DocCreationResult {
  name: string;
  url: string;
  documentId: string;
  objType: string;
  error?: string;
}

export async function createDeliveryDocSet(ipName: string): Promise<DocCreationResult[]> {
  feishuLog(`=== createDeliveryDocSet START for ${ipName} ===`);
  const tenantToken = await getTenantAccessToken();
  if (!tenantToken) {
    feishuLog('FAILED: no tenant token');
    return DELIVERY_TEMPLATES.map(t => ({
      name: t.name, url: '', documentId: '', objType: t.objType,
      error: '无法获取飞书 tenant access token，请检查应用凭证配置',
    }));
  }
  feishuLog('Tenant token: OK');

  const userToken = await getUserAccessToken();
  if (!userToken) {
    feishuLog('FAILED: no user token');
    return DELIVERY_TEMPLATES.map(t => ({
      name: t.name, url: '', documentId: '', objType: t.objType,
      error: '未授权飞书，请先在系统设置中授权飞书账号',
    }));
  }
  feishuLog('User token: OK');

  // Sort templates so 交付流程总览 (sortOrder 1) comes FIRST.
  // Sub-docs are then created under the main doc's wiki node for tree structure.
  const sorted = [...DELIVERY_TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
  const mainDocName = '交付流程总览';
  const results: DocCreationResult[] = [];
  let mainDocNodeToken: string | null = null;

  for (const template of sorted) {
    const newName = `【${ipName}】${template.name}`;
    feishuLog(`--- Processing: ${template.name} (${template.objType}) ---`);
    try {
      if (template.objType === 'docx') {
        const isMainDoc = template.name === mainDocName;
        // For sub-docs, nest under the main doc's wiki node
        const parentToken = (!isMainDoc && mainDocNodeToken) ? mainDocNodeToken : undefined;

        const result = await cloneDocxToWiki(template.objToken, newName, userToken, parentToken);
        if (result) {
          results.push({ name: template.name, url: result.wikiUrl, documentId: result.documentId, objType: 'docx' });
          feishuLog(`  OK: ${result.wikiUrl}`);

          // If this is the main doc, look up its wiki node token so sub-docs nest under it
          if (isMainDoc) {
            mainDocNodeToken = await getDocWikiNode(result.documentId, parentToken || WIKI_PARENT_NODE, userToken);
            feishuLog(`  Main doc node token: ${mainDocNodeToken || 'NOT FOUND'}`);
          }
        } else {
          feishuLog(`  cloneDocxToWiki failed, falling back to Drive copy...`);
          const copyResult = await copyFeishuFile(template.objToken, newName, 'docx', tenantToken);
          if (copyResult) {
            results.push({ name: template.name, url: copyResult.driveUrl, documentId: copyResult.fileToken, objType: 'docx', error: '创建在云盘中（知识库创建失败）' });
          } else {
            results.push({ name: template.name, url: '', documentId: '', objType: 'docx', error: '创建失败' });
          }
        }
      } else {
        // Sheets: copy to Drive, then copy content (Drive copy is async, may not preserve data)
        // Use user token — sheet templates may be in user's personal space
        const copyResult = await copyFeishuFile(template.objToken, newName, 'sheet', userToken);
        if (copyResult) {
          // Explicitly copy sheet content from template to preserve headers/data
          const contentOk = await copySheetContent(template.objToken, copyResult.fileToken, userToken);
          feishuLog(`  Sheet content copy: ${contentOk ? 'OK' : 'FAILED'}`);
          // Try to create a wiki shortcut pointing to the sheet
          if (mainDocNodeToken) {
            const shortcut = await createWikiShortcut('sheet', copyResult.fileToken, newName, mainDocNodeToken, userToken);
            if (shortcut) {
              results.push({ name: template.name, url: shortcut.wikiUrl, documentId: copyResult.fileToken, objType: 'sheet' });
              feishuLog(`  Sheet wiki shortcut OK: ${shortcut.wikiUrl}`);
            } else {
              results.push({ name: template.name, url: copyResult.driveUrl, documentId: copyResult.fileToken, objType: 'sheet', error: '已创建在云盘中（知识库快捷方式创建失败）' });
            }
          } else {
            results.push({ name: template.name, url: copyResult.driveUrl, documentId: copyResult.fileToken, objType: 'sheet', error: '已创建在云盘中' });
          }
        } else {
          results.push({ name: template.name, url: '', documentId: '', objType: 'sheet', error: '创建失败' });
        }
      }
    } catch (e) {
      results.push({ name: template.name, url: '', documentId: '', objType: template.objType, error: (e as Error).message });
    }
  }

  const ok = results.filter(r => !r.error).length;
  const fail = results.filter(r => r.error).length;
  feishuLog(`=== createDeliveryDocSet DONE: ${ok} ok, ${fail} failed ===`);
  return results;
}
