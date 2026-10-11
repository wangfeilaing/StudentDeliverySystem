import crypto from 'crypto';
import { getDb } from '@/lib/db';

// ---- 与飞书相同方式的本地加密，用于存储模型 API Key ----
function getSecretKey(): Buffer {
  return crypto.createHash('sha256').update('claude-code-ip-platform-ai-models').digest();
}
function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getSecretKey(), iv);
  return iv.toString('hex') + ':' + cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}
function decrypt(encoded: string): string {
  if (!encoded || !encoded.includes(':')) return '';
  const parts = encoded.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getSecretKey(), iv);
  return decipher.update(parts.slice(1).join(':'), 'hex', 'utf8') + decipher.final('utf8');
}

export interface AiModelRow {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  api_key: string; // 加密
  model: string;
  is_default: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AiModelPublic {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  is_default: number;
  status: string;
  key_set: boolean;     // 是否已配置 key
  key_hint: string;     // 末四位提示
}

// 列表（脱敏，不返回明文 key）
export function listModels(): AiModelPublic[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ai_models ORDER BY is_default DESC, id ASC').all() as AiModelRow[];
  return rows.map(toPublic);
}

function toPublic(r: AiModelRow): AiModelPublic {
  const key = (() => { try { return decrypt(r.api_key); } catch { return ''; } })();
  return {
    id: r.id, name: r.name, provider: r.provider, base_url: r.base_url, model: r.model,
    is_default: r.is_default, status: r.status,
    key_set: !!key, key_hint: key ? `****${key.slice(-4)}` : '',
  };
}

export function createModel(input: { name: string; provider: string; base_url: string; api_key: string; model: string; is_default?: boolean }): number {
  const db = getDb();
  if (input.is_default) db.prepare('UPDATE ai_models SET is_default = 0').run();
  const info = db.prepare(
    `INSERT INTO ai_models (name, provider, base_url, api_key, model, is_default)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    input.name, input.provider === 'anthropic' ? 'anthropic' : 'openai',
    input.base_url.replace(/\/+$/, ''), encrypt(input.api_key), input.model, input.is_default ? 1 : 0,
  );
  return info.lastInsertRowid as number;
}

export function updateModel(id: number, input: Partial<{ name: string; provider: string; base_url: string; api_key: string; model: string; is_default: boolean; status: string }>): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM ai_models WHERE id = ?').get(id);
  if (!existing) throw new Error('模型不存在');
  if (input.is_default) db.prepare('UPDATE ai_models SET is_default = 0').run();

  const sets: string[] = [];
  const vals: Record<string, unknown> = { id };
  if (input.name !== undefined) { sets.push('name=@name'); vals.name = input.name; }
  if (input.provider !== undefined) { sets.push('provider=@provider'); vals.provider = input.provider === 'anthropic' ? 'anthropic' : 'openai'; }
  if (input.base_url !== undefined) { sets.push('base_url=@base_url'); vals.base_url = input.base_url.replace(/\/+$/, ''); }
  if (input.model !== undefined) { sets.push('model=@model'); vals.model = input.model; }
  if (input.is_default !== undefined) { sets.push('is_default=@is_default'); vals.is_default = input.is_default ? 1 : 0; }
  if (input.status !== undefined) { sets.push('status=@status'); vals.status = input.status; }
  // 只有传了非空 api_key 才更新（避免脱敏回传覆盖成空）
  if (input.api_key) { sets.push('api_key=@api_key'); vals.api_key = encrypt(input.api_key); }
  if (sets.length === 0) return;
  sets.push("updated_at=datetime('now','localtime')");
  db.prepare(`UPDATE ai_models SET ${sets.join(', ')} WHERE id=@id`).run(vals);
}

export function deleteModel(id: number): void {
  getDb().prepare('DELETE FROM ai_models WHERE id = ?').run(id);
}

function loadModelWithKey(id: number): { cfg: AiModelRow; key: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(id) as AiModelRow | undefined;
  if (!row) throw new Error('模型不存在');
  const key = decrypt(row.api_key);
  if (!key) throw new Error('该模型还没有配置 API Key');
  return { cfg: row, key };
}

// ---- 适配器：OpenAI 兼容（GPT / DeepSeek / 通义 / 豆包 / Kimi 等）----
async function callOpenAICompatible(base: string, key: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.85,
      stream: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `模型接口返回 ${res.status}`);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('模型没有返回内容');
  return String(text).trim();
}

// ---- 适配器：Anthropic（Claude）----
async function callAnthropic(base: string, key: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch(`${base.replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Claude 接口返回 ${res.status}`);
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('模型没有返回内容');
  return String(text).trim();
}

async function chat(modelId: number, system: string, user: string): Promise<string> {
  const { cfg, key } = loadModelWithKey(modelId);
  const base = cfg.base_url || (cfg.provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1');
  if (cfg.provider === 'anthropic') return callAnthropic(base, key, cfg.model, system, user);
  return callOpenAICompatible(base, key, cfg.model, system, user);
}

// 简单连通性测试
export async function testModel(modelId: number): Promise<string> {
  return chat(modelId, '你是一个助手，请只回复“ok”。', '回复 ok');
}

const DEFAULT_REWRITE_INSTRUCTION =
  '把下面这条短视频文案改写成一条全新的、不与原文重复的爆款口播文案。要求：保留核心信息点与吸引力钩子，换一种表达方式和结构，语言口语化、有节奏感，适合直接照着念。只输出改写后的文案正文，不要任何解释。';

// 改写一条文案
export async function rewriteText(modelId: number, text: string, instruction?: string): Promise<string> {
  if (!text.trim()) throw new Error('没有可改写的文案内容');
  const system = '你是一名资深的短视频爆款文案二创编辑，擅长在不抄袭的前提下重写文案。';
  const user = `${instruction?.trim() || DEFAULT_REWRITE_INSTRUCTION}\n\n【原文案】\n${text}`;
  return chat(modelId, system, user);
}
