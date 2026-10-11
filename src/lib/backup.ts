import fs from 'fs';
import path from 'path';
import { getDb } from './db';

/**
 * 数据库备份。
 *
 * 背景：系统设置里早有 `auto_backup_enabled` 这个开关，但从来没有实现，
 * 而 settings 页面上的「导出系统数据」实际只是下载一份设置 JSON（还写错了扩展名），
 * 用户以为自己在备份数据库。这里补上真正的备份：
 *   - 用 better-sqlite3 的 `VACUUM INTO` 生成一致性快照（WAL 下也能安全复制）；
 *   - 落到 data/backups/，文件名带时间戳；
 *   - 按保留天数清理旧文件。
 */

const DATA_DIR = path.join(process.cwd(), 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'app.db');

/** 自动备份的最小间隔：一天一次 */
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface BackupInfo {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** 本地时间字符串，与库里其它 datetime 字段保持同一口径（避免 UTC/本地混用）。 */
function localNow(): string {
  return localNowFromDate(new Date());
}

function localNowFromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 立即生成一份备份，返回文件信息。 */
export function createBackup(reason: string = 'manual'): BackupInfo {
  ensureBackupDir();
  const fileName = `app-${timestamp()}-${reason}.db`;
  const target = path.join(BACKUP_DIR, fileName);

  // VACUUM INTO 需要一个不存在的目标文件
  if (fs.existsSync(target)) fs.unlinkSync(target);
  const db = getDb();
  // 参数化在该语句中不被支持，这里路径完全由本模块生成（无外部输入），可安全拼接
  db.prepare(`VACUUM INTO '${target.replace(/'/g, "''")}'`).run();

  const stat = fs.statSync(target);
  // createdAt 用本地时间字符串，和 last_backup_at 一致
  return { fileName, sizeBytes: stat.size, createdAt: localNow() };
}

/** 列出已有备份，新的在前。 */
export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      return { fileName: f, sizeBytes: stat.size, createdAt: localNowFromDate(stat.mtime) };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** 删除超过保留天数的备份，返回删除数量。 */
export function pruneBackups(retentionDays: number): number {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  if (!fs.existsSync(BACKUP_DIR)) return 0;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.endsWith('.db')) continue;
    const full = path.join(BACKUP_DIR, f);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed++;
      }
    } catch (e) {
      console.error('[backup] 清理失败：', full, (e as Error).message);
    }
  }
  return removed;
}

function getSetting(key: string): string {
  try {
    const row = getDb().prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? '';
  } catch {
    return '';
  }
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))")
    .run(key, value);
}

export interface BackupStatus {
  enabled: boolean;
  retentionDays: number;
  lastBackupAt: string | null;
  nextDueAt: string | null;
  backups: BackupInfo[];
  dbSizeBytes: number;
}

/**
 * 把库里存的本地时间字符串（YYYY-MM-DD HH:MM:SS）解析成毫秒时间戳。
 * 不能用 new Date(str)：该格式在部分运行环境下会被当成 UTC，导致时区差 8 小时。
 */
function parseLocalTime(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return NaN;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  ).getTime();
}

export function getBackupStatus(): BackupStatus {
  const backups = listBackups();
  const lastRow = getSetting('last_backup_at');
  const lastBackupAt = lastRow || (backups[0]?.createdAt ?? null);
  const dbSizeBytes = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  const parsed = lastBackupAt ? parseLocalTime(lastBackupAt) : NaN;
  const nextDue = Number.isFinite(parsed) ? localNowFromDate(new Date(parsed + AUTO_BACKUP_INTERVAL_MS)) : null;
  return {
    enabled: getSetting('auto_backup_enabled') === 'true',
    retentionDays: parseInt(getSetting('backup_retention_days') || getSetting('recycle_retention_days') || '30', 10) || 30,
    lastBackupAt,
    nextDueAt: nextDue,
    backups,
    dbSizeBytes,
  };
}

export interface AutoBackupResult {
  ran: boolean;
  reason: string;
  info?: BackupInfo;
  pruned?: number;
}

/**
 * 自动备份触发点。由「登录成功的请求」调用，因此附带进程内节流：
 * 同一天只会真正执行一次，避免每个请求都去 VACUUM 一遍数据库。
 */
let lastAutoAttempt = 0;

export function maybeAutoBackup(): AutoBackupResult {
  const enabled = getSetting('auto_backup_enabled') === 'true';
  if (!enabled) return { ran: false, reason: 'auto_backup_disabled' };

  // 进程内节流：5 分钟内不重复判断
  if (Date.now() - lastAutoAttempt < 5 * 60 * 1000) return { ran: false, reason: 'throttled' };
  lastAutoAttempt = Date.now();

  const status = getBackupStatus();
  if (status.lastBackupAt) {
    const parsed = parseLocalTime(status.lastBackupAt);
    if (Number.isFinite(parsed) && Date.now() < parsed + AUTO_BACKUP_INTERVAL_MS) {
      return { ran: false, reason: 'not_due' };
    }
  }

  try {
    const info = createBackup('auto');
    setSetting('last_backup_at', info.createdAt);
    const pruned = pruneBackups(status.retentionDays);
    console.log(`[backup] 自动备份完成：${info.fileName}（${(info.sizeBytes / 1024 / 1024).toFixed(1)} MB），清理 ${pruned} 个旧备份`);
    return { ran: true, reason: 'created', info, pruned };
  } catch (e) {
    console.error('[backup] 自动备份失败：', (e as Error).message);
    return { ran: false, reason: `error: ${(e as Error).message}` };
  }
}

/** 手动备份，并记录时间戳、顺带清理旧备份。 */
export function runManualBackup(): { info: BackupInfo; pruned: number } {
  const info = createBackup('manual');
  setSetting('last_backup_at', info.createdAt);
  const pruned = pruneBackups(getBackupStatus().retentionDays);
  return { info, pruned };
}
