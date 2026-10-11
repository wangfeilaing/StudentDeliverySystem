import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { getRevenueSummary, getDeliverySummary, getOrderStats } from '@/lib/metrics';

export async function GET() {
  try {
    const db = getDb();

    // --- IP 统计 ---
    const totalIPs = (db.prepare(
      "SELECT COUNT(*) as c FROM ip WHERE deleted_at IS NULL").get() as { c: number }).c;
    const activeIPs = (db.prepare(
      "SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL").get() as { c: number }).c;
    const staleIPs = (db.prepare(
      "SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL AND updated_at < datetime('now', '-7 days', 'localtime')"
    ).get() as { c: number }).c;

    // --- 账号统计 ---
    const totalAccounts = (db.prepare(
      "SELECT COUNT(*) as c FROM social_account").get() as { c: number }).c;
    const totalFollowers = (db.prepare(
      "SELECT COALESCE(SUM(follower_count), 0) as t FROM social_account").get() as { t: number }).t;

    // --- 平台分布 ---
    const platforms = db.prepare(
      "SELECT platform, COUNT(*) as account_count, COALESCE(SUM(follower_count), 0) as followers FROM social_account GROUP BY platform ORDER BY followers DESC"
    ).all() as Array<{ platform: string; account_count: number; followers: number }>;

    // --- 账号绑定检查 ---
    const unboundIPs = (db.prepare(
      "SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL AND id NOT IN (SELECT DISTINCT ip_id FROM social_account)"
    ).get() as { c: number }).c;

    // --- IP 资料完善度 ---
    const incompleteIPs = (db.prepare(
      "SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL AND (real_name = '' OR phone = '' OR cooperation_type = '')"
    ).get() as { c: number }).c;

    // --- 素材统计 ---
    const totalScreenshots = (db.prepare(
      "SELECT COUNT(*) as c FROM screenshot WHERE deleted_at IS NULL").get() as { c: number }).c;
    const totalVideos = (db.prepare(
      "SELECT COUNT(*) as c FROM video WHERE deleted_at IS NULL").get() as { c: number }).c;
    const recentScreenshots7d = (db.prepare(
      "SELECT COUNT(*) as c FROM screenshot WHERE deleted_at IS NULL AND created_at >= datetime('now', '-7 days', 'localtime')"
    ).get() as { c: number }).c;
    const recentVideos7d = (db.prepare(
      "SELECT COUNT(*) as c FROM video WHERE deleted_at IS NULL AND created_at >= datetime('now', '-7 days', 'localtime')"
    ).get() as { c: number }).c;

    // --- 成功案例 ---
    const totalSuccessCases = (db.prepare(
      "SELECT COUNT(*) as c FROM success_cases").get() as { c: number }).c;

    // --- 待处理事项统计 ---
    const pendingItems = staleIPs + unboundIPs + incompleteIPs;

    // --- 趋势数据：近 30 天内容与素材新增 ---
    const trendLabels: string[] = [];
    const contentCreated: number[] = [];
    const materialsAdded: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      trendLabels.push(`${date.getMonth() + 1}/${date.getDate()}`);
      const dayStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dayEnd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate() + 1).padStart(2, '0')}`;
      const sc = (db.prepare(
        "SELECT COUNT(*) as c FROM success_cases WHERE created_at >= ? AND created_at < ?"
      ).get(dayStart, dayEnd) as { c: number }).c;
      contentCreated.push(sc);
      const mat = (db.prepare(
        "SELECT COUNT(*) as c FROM (SELECT created_at FROM screenshot WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? UNION ALL SELECT created_at FROM video WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?)"
      ).get(dayStart, dayEnd, dayStart, dayEnd) as { c: number }).c;
      materialsAdded.push(mat);
    }

    // --- 重点 IP（按账号粉丝总数排序）---
    const topIPs = db.prepare(
      "SELECT i.id, i.name, i.category, i.avatar_path, i.status, i.updated_at, COALESCE(SUM(sa.follower_count), 0) as total_followers, COUNT(sa.id) as account_count FROM ip i LEFT JOIN social_account sa ON sa.ip_id = i.id WHERE i.status = 'active' AND i.deleted_at IS NULL GROUP BY i.id ORDER BY total_followers DESC LIMIT 8"
    ).all() as Array<{ id: number; name: string; category: string; avatar_path: string | null; status: string; updated_at: string; total_followers: number; account_count: number }>;

    // --- 最近操作动态 ---
    const recentActivities = db.prepare(
      "SELECT ol.id, ol.username, ol.action, ol.target_type, ol.detail, ol.created_at FROM operation_logs ol ORDER BY ol.created_at DESC LIMIT 10"
    ).all() as Array<{ id: number; username: string; action: string; target_type: string; detail: string; created_at: string }>;

    // --- IP 粉丝异常检测（简单规则：有账号但粉丝为0） ---
    const anomalyAccounts = (db.prepare(
      "SELECT COUNT(*) as c FROM social_account WHERE follower_count = 0"
    ).get() as { c: number }).c;

    // --- CRM delivery / 营收指标 ---
    // 统一由 src/lib/metrics.ts 提供，和仪表盘页面（src/app/page.tsx）保持同一口径，
    // 避免同一个「总收款」在页面和接口上显示两个不同的数。
    const revenueSummary = getRevenueSummary();
    const deliverySummary = getDeliverySummary();
    const orderStats = getOrderStats();

    const totalRevenue = revenueSummary.totalRevenue;
    const monthRevenue = revenueSummary.monthRevenue;
    const totalTasks = deliverySummary.totalTasks;
    const completedTasks = deliverySummary.completedTasks;
    const avgProgress = deliverySummary.avgProgress;
    const overdueTasks = deliverySummary.overdueTasks;
    const atRiskCount = deliverySummary.atRiskCount;

    return jsonResponse({
      summary: {
        totalIPs, activeIPs,
        totalRevenue, monthRevenue,
        // 实收（人工登记）单独给出，避免和上面的估算口径混淆
        actualPaid: revenueSummary.actualPaid,
        paidCount: revenueSummary.paidCount,
        revenueByTier: revenueSummary.byTier,
        avgOrderAmount: orderStats.avgOrderAmount,
        avgProgress, completedTasks, totalTasks,
        overdueTasks, atRiskCount,
        weekNewContent: recentScreenshots7d + recentVideos7d + totalSuccessCases,
        pendingItems,
      },
      metrics: [
        { key: 'totalIPs', label: 'IP 总数', value: totalIPs, icon: 'users', color: 'blue' },
        { key: 'activeIPs', label: '活跃 IP', value: activeIPs, sub: `共 ${totalIPs} 个`, icon: 'shield', color: 'emerald' },
        { key: 'totalRevenue', label: '总收款', value: totalRevenue, sub: `实收 ¥${revenueSummary.actualPaid.toLocaleString()}（${revenueSummary.paidCount} 个已登记）`, format: 'currency', icon: 'dollar', color: 'emerald' },
        { key: 'avgProgress', label: '平均进度', value: avgProgress, format: 'percent', icon: 'check', color: 'cyan' },
        { key: 'overdueTasks', label: '逾期任务', value: overdueTasks, icon: 'clock', color: 'red' },
      ],
      trend: { labels: trendLabels, contentCreated, materialsAdded },
      alerts: [
        ...(staleIPs > 0 ? [{ type: 'ip_stale', message: `${staleIPs} 个 IP 超过 7 天未更新`, count: staleIPs, priority: 'high' as const }] : []),
        ...(unboundIPs > 0 ? [{ type: 'unbound', message: `${unboundIPs} 个 IP 未绑定任何平台账号`, count: unboundIPs, priority: 'high' as const }] : []),
        ...(incompleteIPs > 0 ? [{ type: 'incomplete', message: `${incompleteIPs} 个 IP 资料未完善`, count: incompleteIPs, priority: 'medium' as const }] : []),
        ...(overdueTasks > 0 ? [{ type: 'overdue', message: `${overdueTasks} 个任务已逾期`, count: overdueTasks, priority: 'high' as const }] : []),
        ...(atRiskCount > 0 ? [{ type: 'at_risk', message: `${atRiskCount} 个风险客户需关注`, count: atRiskCount, priority: 'high' as const }] : []),
      ],
      topIPs, platforms,
      contentStatus: { totalScreenshots, totalVideos, recentScreenshots7d, recentVideos7d, totalSuccessCases },
      recentActivities,
    });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
