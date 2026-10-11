// 抓取单个抖音账号主页的全部作品文案（有头浏览器，首次需扫码登录）
// 用法: node scrape-douyin.mjs "<主页或分享链接>" "<输出json路径>"
import { chromium } from 'playwright';
import fs from 'fs';

const START_URL = process.argv[2];
const OUT = process.argv[3] || '/tmp/douyin-scrape.json';
const PROFILE_DIR = '/Users/feiliang/Desktop/Claude Code/data/douyin-profile';

if (!START_URL) { console.error('缺少链接参数'); process.exit(1); }

function extractAwemes(j) {
  const out = [];
  if (!j || typeof j !== 'object') return out;
  if (Array.isArray(j.aweme_list)) out.push(...j.aweme_list);
  if (Array.isArray(j.data)) {
    for (const it of j.data) {
      if (it && typeof it === 'object') {
        if (it.aweme_info) out.push(it.aweme_info);
        else if (it.aweme_id || it.desc) out.push(it);
      }
    }
  }
  return out;
}
function toItem(a) {
  if (!a || (!a.aweme_id && !a.desc)) return null;
  return {
    aweme_id: a.aweme_id || '',
    author: a.author?.nickname || '',
    desc: (a.desc || '').trim(),
    digg_count: Number(a.statistics?.digg_count) || 0,
    comment_count: Number(a.statistics?.comment_count) || 0,
    create_time: a.create_time || 0,
    url: a.share_url || (a.aweme_id ? `https://www.douyin.com/video/${a.aweme_id}` : ''),
  };
}

const collected = new Map();
let sawApi = 0;
let authorName = '';

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] || await ctx.newPage();

page.on('response', async (res) => {
  const url = res.url();
  if (!url.includes('douyin.com')) return;
  if (!/\/aweme\/v1\/web\/.*(post|aweme|favorite)/.test(url)) return;
  sawApi++;
  try {
    const j = await res.json();
    for (const a of extractAwemes(j)) {
      const it = toItem(a);
      if (it && it.aweme_id && !collected.has(it.aweme_id)) collected.set(it.aweme_id, it);
      if (!authorName && a.author?.nickname) authorName = a.author.nickname;
    }
  } catch { /* ignore */ }
});

console.log('[douyin] 打开:', START_URL);
await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

// 第一阶段：耐心等待登录 / 过验证码（最多 3 分钟），直到抖音开始返回数据
const t0 = Date.now();
let warned = false;
while (sawApi === 0 && Date.now() - t0 < 180000) {
  const title = (await page.title().catch(() => '')) || '';
  if (/验证码|登录|verify|captcha/i.test(title) && !warned) {
    console.log('[douyin] 需要登录或过验证码，请在弹出的浏览器窗口里扫码登录 / 滑动验证…');
    warned = true;
  }
  await page.mouse.wheel(0, 1200).catch(() => {});
  await page.waitForTimeout(2500);
}
if (sawApi === 0) console.log('[douyin] 等待超时，仍未拿到数据。');

// 第二阶段：滚动加载全部作品，连续 5 轮没有新内容就停
let stable = 0, last = 0;
for (let i = 0; i < 60; i++) {
  await page.mouse.wheel(0, 3500).catch(() => {});
  await page.waitForTimeout(1800);
  if (collected.size === last) { stable++; if (stable >= 5) break; }
  else { stable = 0; last = collected.size; }
  if (i % 5 === 0) console.log(`[douyin] 已抓 ${collected.size} 条…`);
}

const items = [...collected.values()].sort((a, b) => b.digg_count - a.digg_count);
fs.writeFileSync(OUT, JSON.stringify({ author: authorName, count: items.length, items }, null, 2));
console.log(`[douyin] DONE 作者=「${authorName}」 共 ${items.length} 条 → ${OUT}`);
await ctx.close().catch(() => {});
process.exit(0);
