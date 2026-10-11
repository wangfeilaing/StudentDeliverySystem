// 经用户明确授权：把飞书文档设为"获得链接的任何人可编辑、可多人协同"
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const DB = path.join(__dirname, '..', 'data', 'app.db');
const BASE = 'https://open.feishu.cn/open-apis';

function key() { return crypto.createHash('sha256').update('claude-code-ip-platform-feishu-doc').digest(); }
function decrypt(enc) { const p = enc.split(':'); const d = crypto.createDecipheriv('aes-256-cbc', key(), Buffer.from(p[0], 'hex')); return d.update(p.slice(1).join(':'), 'hex', 'utf8') + d.final('utf8'); }

const TOKENS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'Qx1tdk8pxo7miBxxsy0c9JBRnuc', // 选题痛点库
  'AX04dhCcao8co1xt0ftc5dEbnSg', // 真实口播+仿写
  'NTzqd0TP6oZIGtxjsKSchNDBnLc', // 8条对照
];

(async () => {
  const db = new Database(DB, { readonly: true });
  const appId = db.prepare("SELECT value FROM system_settings WHERE key='feishu_app_id'").get().value;
  const appSecret = decrypt(db.prepare("SELECT value FROM system_settings WHERE key='feishu_app_secret'").get().value);
  const tj = await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret }) })).json();
  const token = tj.tenant_access_token;
  for (const t of TOKENS) {
    const res = await fetch(`${BASE}/drive/v2/permissions/${t}/public?type=docx`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_access_entity: 'open', link_share_entity: 'anyone_editable', share_entity: 'anyone', comment_entity: 'anyone_can_edit' }),
    });
    const j = await res.json();
    console.log(t, '=>', j.code === 0 ? 'OK 任何人可编辑·可协同' : JSON.stringify(j));
  }
})().catch(e => { console.error(e.message); process.exit(1); });
