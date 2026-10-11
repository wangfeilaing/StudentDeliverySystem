import path from 'path';

// 采集到的单条
export interface CollectedItem {
  aweme_id: string;
  author: string;
  author_url: string;
  title: string;
  original_text: string;
  digg_count: number;
  comment_count: number;
  share_count: number;
  video_url: string;
  cover_url: string;
}

export interface CollectOptions {
  mode: string;       // douyin_profile | douyin_search | douyin_batch
  keyword: string;    // 主页链接 / 搜索词；batch 模式下可多行链接
  minDigg: number;
  maxItems?: number;
}

// 浏览器登录态持久化目录（cookie 存这里，登录一次后续免登）
const PROFILE_DIR = path.join(process.cwd(), 'data', 'douyin-profile');

interface RawAweme {
  aweme_id?: string;
  desc?: string;
  share_url?: string;
  statistics?: { digg_count?: number; comment_count?: number; share_count?: number };
  author?: { nickname?: string; sec_uid?: string };
  video?: { cover?: { url_list?: string[] } };
}

// 从抖音各种接口返回里尽量稳健地提取 aweme 列表
function extractAwemes(json: unknown): RawAweme[] {
  const out: RawAweme[] = [];
  const j = json as Record<string, unknown>;
  if (!j || typeof j !== 'object') return out;

  // 1) 作品列表接口：{ aweme_list: [...] }
  if (Array.isArray(j.aweme_list)) out.push(...(j.aweme_list as RawAweme[]));

  // 2) 搜索接口：{ data: [ { aweme_info: {...} }, ... ] }
  if (Array.isArray(j.data)) {
    for (const it of j.data as Array<Record<string, unknown>>) {
      if (it && typeof it === 'object') {
        if (it.aweme_info) out.push(it.aweme_info as RawAweme);
        else if (it.aweme_id || it.desc) out.push(it as RawAweme);
      }
    }
  }
  return out;
}

function toItem(a: RawAweme): CollectedItem | null {
  if (!a || (!a.aweme_id && !a.desc)) return null;
  const desc = (a.desc || '').trim();
  return {
    aweme_id: a.aweme_id || '',
    author: a.author?.nickname || '',
    author_url: a.author?.sec_uid ? `https://www.douyin.com/user/${a.author.sec_uid}` : '',
    title: desc.slice(0, 40) || '无标题',
    original_text: desc,
    digg_count: Number(a.statistics?.digg_count) || 0,
    comment_count: Number(a.statistics?.comment_count) || 0,
    share_count: Number(a.statistics?.share_count) || 0,
    video_url: a.share_url || (a.aweme_id ? `https://www.douyin.com/video/${a.aweme_id}` : ''),
    cover_url: a.video?.cover?.url_list?.[0] || '',
  };
}

function targetUrls(opts: CollectOptions): string[] {
  if (opts.mode === 'douyin_search') {
    return [`https://www.douyin.com/search/${encodeURIComponent(opts.keyword)}?type=video`];
  }
  // profile / batch：关键词里就是主页链接（batch 可多行）
  return opts.keyword.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

/**
 * 用真实浏览器采集抖音。第一次会弹出窗口需扫码登录（之后免登）。
 * 注意：必须在有桌面环境的机器上运行（headless=false）。返回按点赞过滤后的列表。
 */
export async function collectDouyin(opts: CollectOptions): Promise<CollectedItem[]> {
  const maxItems = opts.maxItems || 60;
  const headless = process.env.DOUYIN_HEADLESS === '1';

  // 懒加载 playwright，未安装时给出清晰提示
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('采集需要 playwright，但未安装。请在项目目录运行：npm install playwright && npx playwright install chromium');
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const collected = new Map<string, CollectedItem>();
  let sawAwemeApi = 0;

  const onResponse = async (res: { url: () => string; json: () => Promise<unknown> }) => {
    const url = res.url();
    if (!url.includes('douyin.com')) return;
    if (!/\/aweme\/v1\/web\/.*(post|search|favorite|aweme)/.test(url)) return;
    sawAwemeApi++;
    try {
      const json = await res.json();
      for (const raw of extractAwemes(json)) {
        const item = toItem(raw);
        if (item && item.aweme_id && !collected.has(item.aweme_id)) {
          collected.set(item.aweme_id, item);
        }
      }
    } catch { /* 非 JSON 或解析失败，忽略 */ }
  };

  try {
    const page = context.pages()[0] || await context.newPage();
    page.on('response', onResponse);

    for (const url of targetUrls(opts)) {
      console.log('[douyin] 打开页面:', url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

      // 第一阶段：耐心等待——若需要登录/验证码，给用户最多 3 分钟在弹窗里完成，
      // 直到抖音开始返回视频数据为止。
      const startWait = Date.now();
      let warned = false;
      while (sawAwemeApi === 0 && Date.now() - startWait < 180000) {
        const title = (await page.title().catch(() => '')) || '';
        if (/验证码|登录|verify|captcha/i.test(title) && !warned) {
          console.log('[douyin] 需要登录或过验证码，请在弹出的浏览器窗口完成（扫码 / 滑块）。等待中…');
          warned = true;
        }
        await page.mouse.wheel(0, 1500).catch(() => {});
        await page.waitForTimeout(2500);
      }
      if (sawAwemeApi === 0) {
        console.log('[douyin] 等待超时，仍未拿到数据（可能未登录或被持续拦截）。');
      }

      // 第二阶段：正常滚动，加载更多
      for (let i = 0; i < 25 && collected.size < maxItems; i++) {
        await page.mouse.wheel(0, 3200).catch(() => {});
        await page.waitForTimeout(1800);
      }
      console.log(`[douyin] ${url} → 已采集 ${collected.size} 条（命中接口 ${sawAwemeApi} 次）`);
      if (collected.size >= maxItems) break;
    }
  } finally {
    await context.close().catch(() => {});
  }

  return [...collected.values()]
    .filter(it => it.digg_count >= (opts.minDigg || 0))
    .sort((a, b) => b.digg_count - a.digg_count)
    .slice(0, maxItems);
}
