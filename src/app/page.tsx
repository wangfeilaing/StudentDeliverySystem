import { getDb } from '@/lib/db';
import { getRevenueSummary, getDeliverySummary, getOrderStats } from '@/lib/metrics';
import { getCurrentUser } from '@/lib/session';
import Link from 'next/link';
import UserAvatar from '@/components/ui/UserAvatar';
import TrendChart from '@/components/dashboard/TrendChart';
import KpiCard from '@/components/dashboard/KpiCard';

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员', admin: '管理员', operator: '运营人员', business: '商务人员', readonly: '只读人员',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-50 text-red-600 border-red-200',
  medium: 'bg-amber-50 text-amber-600 border-amber-200',
  low: 'bg-gray-50 text-gray-500 border-gray-200',
};

const priorityLabels: Record<string, string> = {
  high: '高', medium: '中', low: '低',
};

const statusLabel: Record<string, string> = { active: '活跃', inactive: '待维护', archived: '已归档' };
const statusStyle: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', inactive: 'bg-amber-100 text-amber-700', archived: 'bg-gray-100 text-gray-500' };

export default async function DashboardPage() {
  const db = getDb();
  const currentUser = await getCurrentUser();

  const totalIPs = (db.prepare("SELECT COUNT(*) as c FROM ip WHERE deleted_at IS NULL").get() as { c: number }).c;
  const activeIPs = (db.prepare("SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL").get() as { c: number }).c;
  const staleIPs = (db.prepare("SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL AND updated_at < datetime('now', '-7 days', 'localtime')").get() as { c: number }).c;
  const totalAccounts = (db.prepare("SELECT COUNT(*) as c FROM social_account").get() as { c: number }).c;
  const totalFollowers = (db.prepare("SELECT COALESCE(SUM(follower_count), 0) as t FROM social_account").get() as { t: number }).t;
  const unboundIPs = (db.prepare("SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL AND id NOT IN (SELECT DISTINCT ip_id FROM social_account)").get() as { c: number }).c;
  const incompleteIPs = (db.prepare("SELECT COUNT(*) as c FROM ip WHERE status = 'active' AND deleted_at IS NULL AND (real_name = '' OR phone = '' OR cooperation_type = '')").get() as { c: number }).c;
  const totalScreenshots = (db.prepare("SELECT COUNT(*) as c FROM screenshot WHERE deleted_at IS NULL").get() as { c: number }).c;
  const totalVideos = (db.prepare("SELECT COUNT(*) as c FROM video WHERE deleted_at IS NULL").get() as { c: number }).c;
  const recentScreenshots7d = (db.prepare("SELECT COUNT(*) as c FROM screenshot WHERE deleted_at IS NULL AND created_at >= datetime('now', '-7 days', 'localtime')").get() as { c: number }).c;
  const recentVideos7d = (db.prepare("SELECT COUNT(*) as c FROM video WHERE deleted_at IS NULL AND created_at >= datetime('now', '-7 days', 'localtime')").get() as { c: number }).c;
  const totalSuccessCases = (db.prepare("SELECT COUNT(*) as c FROM success_cases").get() as { c: number }).c;
  const anomalyAccounts = (db.prepare("SELECT COUNT(*) as c FROM social_account WHERE follower_count = 0").get() as { c: number }).c;
  const totalMaterials = totalScreenshots + totalVideos;
  const pendingItems = staleIPs + unboundIPs + incompleteIPs + anomalyAccounts;

  const platforms = db.prepare(
    "SELECT platform, COUNT(*) as account_count, COALESCE(SUM(follower_count), 0) as followers FROM social_account GROUP BY platform ORDER BY followers DESC"
  ).all() as Array<{ platform: string; account_count: number; followers: number }>;

  const trendLabels: string[] = [];
  const contentCreated: number[] = [];
  const materialsAdded: number[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const de = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate() + 1).padStart(2, '0')}`;
    trendLabels.push(`${date.getMonth() + 1}/${date.getDate()}`);
    contentCreated.push((db.prepare("SELECT COUNT(*) as c FROM success_cases WHERE created_at >= ? AND created_at < ?").get(ds, de) as { c: number }).c);
    materialsAdded.push((db.prepare("SELECT COUNT(*) as c FROM (SELECT created_at FROM screenshot WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? UNION ALL SELECT created_at FROM video WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?)").get(ds, de, ds, de) as { c: number }).c);
  }

  const recentContent = contentCreated.slice(-30);
  const recentMaterials = materialsAdded.slice(-30);

  const topIPs = db.prepare(
    "SELECT i.id, i.name, i.category, i.avatar_path, i.status, COALESCE(SUM(sa.follower_count), 0) as total_followers, COUNT(sa.id) as account_count FROM ip i LEFT JOIN social_account sa ON sa.ip_id = i.id WHERE i.status = 'active' AND i.deleted_at IS NULL GROUP BY i.id ORDER BY total_followers DESC LIMIT 6"
  ).all() as Array<{ id: number; name: string; category: string; avatar_path: string | null; status: string; total_followers: number; account_count: number }>;

  const recentActivities = db.prepare(
    "SELECT ol.username, ol.action, ol.target_type, ol.detail, ol.created_at FROM operation_logs ol ORDER BY ol.created_at DESC LIMIT 8"
  ).all() as Array<{ username: string; action: string; target_type: string; detail: string; created_at: string }>;

  // ---- Profit & Loss (盈亏概览) ----
  // 营收口径统一由 src/lib/metrics.ts 提供，避免与 /api/dashboard 各算一套。
  const revenue = getRevenueSummary();
  const revenueBreakdown = {
    total_revenue: revenue.totalRevenue,
    actual_paid: revenue.actualPaid,
    paid_count: revenue.paidCount,
    total_ip_count: revenue.totalIpCount,
  };
  const revenueByTier = revenue.byTier.map(t => ({ label: t.label, ip_count: t.ipCount, revenue: t.revenue }));

  // Ad spend estimate: 未取消订单 × 单客获取成本区间（30~50 元/单）
  const orders = getOrderStats();
  const adOrderCount = orders.activeOrderCount;
  const adCostLow = adOrderCount * 30;
  const adCostHigh = adOrderCount * 50;
  const adCostAvg = adOrderCount * 40;

  // 订单金额（每单实付）改为从真实订单数据推导，不再在源码里写死 5.2。
  // 原先硬编码 5.2 元/单，商品一调价这里就会静默算错。
  const avgOrderAmount = orders.avgOrderAmount;
  const effectiveCostLow = adCostLow - adOrderCount * avgOrderAmount;
  const effectiveCostHigh = adCostHigh - adOrderCount * avgOrderAmount;

  const totalRevenue = revenueBreakdown.total_revenue;
  const profitLow = totalRevenue - adCostHigh;
  const profitHigh = totalRevenue - adCostLow;
  const profitAvg = totalRevenue - adCostAvg;
  const roi = adCostAvg > 0 ? (totalRevenue / adCostAvg).toFixed(1) : '0';

  // ---- CRM delivery metrics ----
  const delivery = getDeliverySummary();
  const monthRevenue = revenue.monthRevenue;
  const totalTasks = delivery.totalTasks;
  const completedTasks = delivery.completedTasks;
  const avgProgress = delivery.avgProgress;
  const upcomingDeadlines = db.prepare(
    "SELECT cdt.*, ip.name as client_name FROM client_delivery_tasks cdt JOIN ip ON ip.id = cdt.client_id WHERE cdt.status != 'completed' AND cdt.status != 'cancelled' AND cdt.due_date >= date('now','localtime') AND cdt.due_date <= date('now','+7 days','localtime') AND ip.deleted_at IS NULL ORDER BY cdt.due_date ASC LIMIT 10"
  ).all() as Array<{ id: number; task_name: string; due_date: string; stage_name: string; status: string; client_name: string; client_id: number }>;
  const overdueCountResult = db.prepare(
    "SELECT COUNT(*) as c FROM client_delivery_tasks cdt JOIN ip ON ip.id = cdt.client_id WHERE cdt.status != 'completed' AND cdt.status != 'cancelled' AND cdt.due_date < date('now','localtime') AND ip.deleted_at IS NULL"
  ).get() as { c: number };
  const overdueTasks = overdueCountResult.c;
  const atRiskClients = db.prepare(
    `SELECT * FROM (
      SELECT ip.id, ip.name, ip.status, ip.paid_amount, ip.cooperation_end_date,
        (SELECT COUNT(*) FROM client_delivery_tasks WHERE client_id = ip.id) as total_tasks,
        (SELECT COUNT(*) FROM client_delivery_tasks WHERE client_id = ip.id AND status = 'completed') as done_tasks,
        (SELECT COUNT(*) FROM client_delivery_tasks WHERE client_id = ip.id AND status != 'completed' AND status != 'cancelled' AND due_date < date('now','localtime')) as overdue_count
      FROM ip WHERE ip.deleted_at IS NULL AND ip.status = 'active'
    ) sub
    WHERE overdue_count > 0 OR (total_tasks > 0 AND CAST(done_tasks AS REAL) / total_tasks < 0.7 AND cooperation_end_date < date('now','+30 days','localtime'))
    ORDER BY overdue_count DESC LIMIT 8`
  ).all() as Array<{ id: number; name: string; status: string; paid_amount: number; cooperation_end_date: string; total_tasks: number; done_tasks: number; overdue_count: number }>;

  const staleIPList = db.prepare(
    "SELECT id, name, status, updated_at FROM ip WHERE status != 'ended' AND deleted_at IS NULL AND updated_at < datetime('now', '-14 days', 'localtime') ORDER BY updated_at ASC LIMIT 6"
  ).all() as Array<{ id: number; name: string; status: string; updated_at: string }>;

  const alerts: Array<{ type: string; message: string; count: number; priority: 'high' | 'medium' | 'low'; link?: string }> = [];
  if (staleIPs > 0) alerts.push({ type: 'ip_stale', message: `${staleIPs} 个 IP 超过 7 天未更新`, count: staleIPs, priority: 'high', link: '/ips' });
  if (unboundIPs > 0) alerts.push({ type: 'unbound', message: `${unboundIPs} 个 IP 未绑定平台账号`, count: unboundIPs, priority: 'high', link: '/ips' });
  if (incompleteIPs > 0) alerts.push({ type: 'incomplete', message: `${incompleteIPs} 个 IP 资料未完善`, count: incompleteIPs, priority: 'medium', link: '/ips' });
  if (anomalyAccounts > 0) alerts.push({ type: 'anomaly', message: `${anomalyAccounts} 个账号粉丝数据异常`, count: anomalyAccounts, priority: 'medium', link: '/ips' });

  const weekNew = recentScreenshots7d + recentVideos7d + totalSuccessCases;

  const glass = 'glass-dashboard-card';
  const glassEmphasis = 'glass-dashboard-card-emphasis';

  return (
    <div className="animate-fade-up space-y-5">
      {/* === Welcome Hero === */}
      <div className="glass-dashboard-card-emphasis p-6 flex items-center gap-5">
        {currentUser && (
          <div className="avatar-cosmic-ring inline-flex flex-shrink-0">
            <UserAvatar userId={currentUser.id} avatarPath={currentUser.avatar_path} displayName={currentUser.display_name || currentUser.username} size="lg" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-[20px] font-bold text-gray-800">
            你好，{currentUser?.display_name || currentUser?.username || '用户'}
          </h3>
          <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
            当前管理 <strong className="text-gray-700">{totalIPs}</strong> 个 IP，
            <strong className="text-emerald-600">{activeIPs}</strong> 个活跃，
            本周新增 <strong className="text-emerald-600">{weekNew}</strong> 个内容
            {pendingItems > 0 && (
              <span>，<strong className="text-red-500">{pendingItems}</strong> 个待处理</span>
            )}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {currentUser ? (roleLabels[currentUser.role] || currentUser.role) : ''} · {platforms.length} 个平台 · {totalAccounts} 个账号 · {totalFollowers >= 10000 ? `${(totalFollowers / 10000).toFixed(1)}万` : totalFollowers.toLocaleString()} 粉丝
          </p>
        </div>
      </div>

      {/* === 盈亏概览 — Profit & Loss === */}
      <div className={`rounded-2xl p-5 border-2 ${profitAvg >= 0 ? 'bg-gradient-to-r from-emerald-50/80 to-cyan-50/60 border-emerald-200/60 shadow-[0_0_30px_rgba(16,185,129,0.08)]' : 'bg-gradient-to-r from-red-50/80 to-amber-50/60 border-red-200/60 shadow-[0_0_30px_rgba(239,68,68,0.08)]'}`}>
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${profitAvg >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {profitAvg >= 0 ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
              )}
            </svg>
          </div>
          <h3 className="text-[16px] font-bold text-gray-800">盈亏概览</h3>
          <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${profitAvg >= 0 ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-400/20' : 'bg-red-500/15 text-red-700 border border-red-400/20'}`}>
            {profitAvg >= 0 ? '盈利中' : '亏损中'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Cost Card */}
          <div className="bg-white/60 rounded-xl p-4 border border-black/5">
            <p className="text-[11px] text-gray-500 mb-1">预估总投入（广告投放）</p>
            <p className="text-[22px] font-bold font-mono text-gray-800">
              ¥{adCostLow.toLocaleString()} ~ ¥{adCostHigh.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {adOrderCount} 单 × 30~50 元/单
            </p>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-400">扣除引流品实付（¥{avgOrderAmount.toFixed(2)}/单，按订单数据推导）后</p>
              <p className="text-[12px] font-mono font-medium text-gray-600">
                ¥{effectiveCostLow.toLocaleString()} ~ ¥{effectiveCostHigh.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Revenue Card */}
          <div className="bg-white/60 rounded-xl p-4 border border-black/5">
            <p className="text-[11px] text-gray-500 mb-1">总营收（课程收入）</p>
            <p className="text-[22px] font-bold font-mono text-emerald-700">
              ¥{totalRevenue.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {revenueBreakdown.total_ip_count} 个 IP · {revenueBreakdown.paid_count} 个已登记实收
            </p>
            {/* Per-tier breakdown */}
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
              {revenueByTier.map(t => (
                <div key={t.label} className="flex justify-between text-[11px]">
                  <span className="text-gray-500">{t.label} ({t.ip_count}人)</span>
                  <span className="font-mono text-gray-700">¥{t.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Profit/Loss Card */}
          <div className={`rounded-xl p-4 border-2 ${profitAvg >= 0 ? 'bg-emerald-50/80 border-emerald-300' : 'bg-red-50/80 border-red-300'}`}>
            <p className="text-[11px] text-gray-500 mb-1">预估净利润</p>
            <p className={`text-[22px] font-bold font-mono ${profitAvg >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {profitAvg >= 0 ? '+' : ''}¥{profitLow.toLocaleString()} ~ {profitAvg >= 0 ? '+' : ''}¥{profitHigh.toLocaleString()}
            </p>
            <p className={`text-[11px] mt-1 ${profitAvg >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              中间值 ¥{profitAvg >= 0 ? '+' : ''}{profitAvg.toLocaleString()}
            </p>
            <div className="mt-2 pt-2 border-t border-black/10">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">ROI</span>
                <span className={`font-mono font-bold ${Number(roi) >= 1 ? 'text-emerald-700' : 'text-red-600'}`}>{roi}x</span>
              </div>
              <div className="flex justify-between text-[11px] mt-0.5">
                <span className="text-gray-500">投产比</span>
                <span className="font-mono text-gray-700">1:{roi}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* === KPI Cards Row === */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard label="IP 总数" value={totalIPs} sub={`${activeIPs} 个活跃中`}
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          color="emerald" sparklineData={recentContent} />
        <KpiCard label="平台账号" value={totalAccounts} sub={`${platforms.length} 个平台`}
          icon="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          color="cyan" sparklineData={recentContent.map((v, i) => v + (recentMaterials[i] || 0))} />
        <KpiCard label="全网粉丝" value={totalFollowers >= 10000 ? `${(totalFollowers / 10000).toFixed(1)}万` : totalFollowers.toLocaleString()} sub={`覆盖 ${platforms.length} 个平台`}
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          color="amber" sparklineData={recentContent.map((v, i) => Math.max(v * 100, i > 0 ? 0 : 100))} />
        <KpiCard label="本周新增" value={weekNew} sub={`素材 ${recentScreenshots7d + recentVideos7d} · 案例 ${totalSuccessCases}`}
          icon="M12 6v6m0 0v6m0-6h6m-6 0H6"
          color="orange" sparklineData={contentCreated.slice(-14)} />
        <KpiCard label="待处理" value={pendingItems} sub={pendingItems > 0 ? `${alerts.length} 类事项需关注` : '一切正常'}
          icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
          color={pendingItems > 0 ? 'red' : 'emerald'} />
      </div>

      {/* === CRM Delivery KPI Row === */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard label="总收款金额" value={`¥${totalRevenue.toLocaleString()}`} sub={`本月 +¥${monthRevenue.toLocaleString()}`}
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          color="emerald" />
        <KpiCard label="平均交付进度" value={`${avgProgress}%`} sub={`${completedTasks}/${totalTasks} 任务完成`}
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          color={avgProgress >= 70 ? 'emerald' : avgProgress >= 40 ? 'amber' : 'red'} />
        <KpiCard label="即将到期" value={upcomingDeadlines.length} sub={`未来7天`}
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          color={upcomingDeadlines.length > 5 ? 'red' : upcomingDeadlines.length > 2 ? 'amber' : 'cyan'} />
        <KpiCard label="已逾期任务" value={overdueTasks} sub="超过截止日期未完成"
          icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
          color={overdueTasks > 0 ? 'red' : 'emerald'} />
        <KpiCard label="风险客户" value={atRiskClients.length} sub={atRiskClients.length > 0 ? '需重点关注' : '暂无风险'}
          icon="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          color={atRiskClients.length > 3 ? 'red' : atRiskClients.length > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* === Bento Row 1: Trend Chart + Alerts === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${glass} p-5`}>
          <TrendChart labels={trendLabels} contentCreated={contentCreated} materialsAdded={materialsAdded} />
        </div>
        <div className={`${glass} p-5 flex flex-col`}>
          <h4 className="text-[14px] font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            待办与提醒
          </h4>
          {alerts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px]">一切正常，暂无待办</p>
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-auto">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${priorityColors[a.priority]}`}>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-0.5 flex-shrink-0 ${priorityColors[a.priority]}`}>
                    {priorityLabels[a.priority]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700">{a.message}</p>
                  </div>
                  {a.link && (
                    <Link href={a.link} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-500 flex-shrink-0 mt-0.5">
                      查看 →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* === Bento Row 2: Top IPs + Platform Donut === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${glass} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold text-gray-700">重点 IP 表现榜</h4>
            <Link href="/ips" className="text-[12px] text-emerald-600 hover:text-emerald-500 font-medium">查看全部 →</Link>
          </div>
          {topIPs.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-8">暂无 IP 数据</p>
          ) : (
            <div className="space-y-1">
              {topIPs.map((ip, i) => {
                const isTop3 = i < 3;
                return (
                <Link key={ip.id} href={`/ips/${ip.id}`} className={`flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-xl hover:bg-white/20 transition-colors group ${isTop3 ? 'py-3' : ''}`}>
                  <span className={`text-[11px] font-bold w-5 flex items-center justify-center ${isTop3 ? 'text-amber-500 text-[14px]' : 'text-gray-400'}`}>
                    {isTop3 ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 1l2.5 7.5L20 9l-6 5 1.5 7.5L10 16l-5.5 5.5L6 14 0 9l7.5-.5z" clipRule="evenodd" />
                      </svg>
                    ) : i + 1}
                  </span>
                  <div className={`rounded-xl bg-gradient-to-br from-emerald-100 to-cyan-100 flex items-center justify-center font-bold text-emerald-600 flex-shrink-0 overflow-hidden border border-emerald-200 ${isTop3 ? 'w-11 h-11 text-sm' : 'w-8 h-8 text-xs'}`}>
                    {ip.avatar_path ? (
                      <img src={`/api/uploads/${ip.avatar_path}`} alt={ip.name} className="w-full h-full object-cover" />
                    ) : (
                      ip.name.charAt(0)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-gray-700 truncate group-hover:text-emerald-600 transition-colors ${isTop3 ? 'text-[14px]' : 'text-[13px]'}`}>{ip.name}</div>
                    <div className="text-[11px] text-gray-400">{ip.category || '未分类'} · {ip.account_count} 个账号</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold text-gray-700 ${isTop3 ? 'text-[15px]' : 'text-[13px]'}`}>{ip.total_followers >= 10000 ? `${(ip.total_followers / 10000).toFixed(1)}万` : ip.total_followers.toLocaleString()}</div>
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-md font-medium ${statusStyle[ip.status] || statusStyle.active}`}>
                      {statusLabel[ip.status] || '活跃'}
                    </span>
                  </div>
                </Link>
              )})}
            </div>
          )}
        </div>

        {/* Platform Donut */}
        <div className={`${glass} p-5 flex flex-col`}>
          <h4 className="text-[14px] font-semibold text-gray-700 mb-4">平台账号分布</h4>
          {platforms.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-[13px]">暂无平台数据</div>
          ) : (
            <div className="flex-1 flex flex-col items-center gap-4">
              <svg viewBox="0 0 120 120" className="w-[120px] h-[120px] flex-shrink-0">
                {(() => {
                  const total = platforms.reduce((s, p) => s + p.followers, 0) || 1;
                  const circumference = 2 * Math.PI * 42;
                  let offset = 0;
                  const donutColors = ['#10b981', '#06b6d4', '#f59e0b', '#34d399', '#fbbf24', '#ef4444', '#ec4899', '#6366f1'];
                  return platforms.map((p, i) => {
                    const pct = Math.max(p.followers / total, 0.02);
                    const length = pct * circumference;
                    const currentOffset = offset;
                    offset += length;
                    return (
                      <circle key={p.platform} cx="60" cy="60" r="42" fill="none"
                        stroke={donutColors[i % donutColors.length]} strokeWidth="12"
                        strokeDasharray={`${length} ${circumference - length}`}
                        strokeDashoffset={-currentOffset}
                        className="transition-all duration-500" style={{ strokeLinecap: 'round' }} />
                    );
                  });
                })()}
                <circle cx="60" cy="60" r="34" fill="rgba(255, 255, 255, 0.55)" />
                <text x="60" y="57" textAnchor="middle" className="text-[14px] font-bold" fill="#14191d">{platforms.length}</text>
                <text x="60" y="71" textAnchor="middle" className="text-[9px]" fill="#758288">平台</text>
              </svg>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full px-2">
                {platforms.map((p, i) => {
                  const donutColors = ['#10b981', '#06b6d4', '#f59e0b', '#34d399', '#fbbf24', '#ef4444', '#ec4899', '#6366f1'];
                  return (
                    <div key={p.platform} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: donutColors[i % donutColors.length] }} />
                      <span className="text-[11px] text-gray-500 truncate">{p.platform}</span>
                      <span className="text-[11px] text-gray-400 ml-auto">{p.account_count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === CRM: Upcoming Deadlines + At-Risk Clients === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Deadlines */}
        <div className={`${glass} p-5 flex flex-col`}>
          <h4 className="text-[14px] font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            即将到期任务
          </h4>
          {upcomingDeadlines.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px]">暂无即将到期任务</p>
            </div>
          ) : (
            <div className="flex-1 space-y-1.5 overflow-auto">
              {upcomingDeadlines.map(t => (
                <Link key={t.id} href={`/ips/${t.client_id}`} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/20 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-600 truncate">{t.task_name}</div>
                    <div className="text-[10px] text-gray-400">{t.client_name} · 截止: {t.due_date}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* At-Risk Clients */}
        <div className={`${glass} p-5 flex flex-col`}>
          <h4 className="text-[14px] font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            风险客户
          </h4>
          {atRiskClients.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px]">暂无风险客户</p>
            </div>
          ) : (
            <div className="flex-1 space-y-1.5 overflow-auto">
              {atRiskClients.map(c => {
                const prog = c.total_tasks > 0 ? Math.round((c.done_tasks / c.total_tasks) * 100) : 0;
                return (
                <Link key={c.id} href={`/ips/${c.id}`} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/20 transition-colors group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] flex-shrink-0 ${
                    c.overdue_count > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    {c.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-600 truncate flex items-center gap-1.5">
                      {c.name}
                      {c.overdue_count > 0 && <span className="text-[10px] px-1 py-0.5 rounded bg-red-50 text-red-500 border border-red-200 font-medium">{c.overdue_count} 逾期</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1 rounded-full bg-black/[0.04] overflow-hidden max-w-[80px]">
                        <div className={`h-full rounded-full ${prog >= 70 ? 'bg-emerald-400' : prog >= 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${prog}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{prog}% · ¥{c.paid_amount.toLocaleString()}</span>
                    </div>
                  </div>
                </Link>
              )})}
            </div>
          )}
        </div>
      </div>

      {/* === Bento Row 3: Maintenance + Content Stats === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stale IPs */}
        <div className={`${glass} p-5 flex flex-col`}>
          <h4 className="text-[14px] font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            待维护 IP
          </h4>
          {staleIPList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px]">所有 IP 状态良好</p>
            </div>
          ) : (
            <div className="flex-1 space-y-1.5 overflow-auto">
              {staleIPList.map(ip => (
                <Link key={ip.id} href={`/ips/${ip.id}`} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/20 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-600 flex-shrink-0 border border-amber-200">
                    {ip.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-600 truncate group-hover:text-amber-600 transition-colors">{ip.name}</div>
                    <div className="text-[10px] text-gray-400">
                      {ip.updated_at ? new Date(ip.updated_at).toLocaleDateString('zh-CN') : '从未更新'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Content Stats + Activity */}
        <div className={`lg:col-span-2 ${glass} p-5`}>
          <h4 className="text-[14px] font-semibold text-gray-700 mb-4">内容与素材状态</h4>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: '截图素材', value: totalScreenshots, sub: `近7天 +${recentScreenshots7d}`, icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'emerald' as const },
              { label: '视频素材', value: totalVideos, sub: `近7天 +${recentVideos7d}`, icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', color: 'orange' as const },
              { label: '成功案例', value: totalSuccessCases, sub: '转化结果记录', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'cyan' as const },
              { label: '素材总计', value: totalMaterials, sub: `${platforms.length} 个平台相关`, icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4', color: 'amber' as const },
            ].map((item, i) => {
              const cm: Record<string, string> = { emerald: 'bg-emerald-100 text-emerald-600', cyan: 'bg-cyan-100 text-cyan-600', amber: 'bg-amber-100 text-amber-600', orange: 'bg-orange-100 text-orange-600' };
              return (
              <div key={i} className="glass-dashboard-card-inner p-4">
                <div className={`w-8 h-8 rounded-xl ${cm[item.color].split(' ')[0]} flex items-center justify-center mb-2`}>
                  <svg className={`w-[14px] h-[14px] ${cm[item.color].split(' ')[1]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={item.icon} />
                  </svg>
                </div>
                <div className="text-xl font-bold text-gray-800">{item.value}</div>
                <div className="text-[13px] font-medium text-gray-500">{item.label}</div>
                <div className="text-[11px] text-gray-400">{item.sub}</div>
              </div>
            )})}
          </div>
          {recentActivities.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <h5 className="text-[12px] font-medium text-gray-400 mb-2">最近操作</h5>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {recentActivities.slice(0, 5).map((act, i) => (
                  <span key={i} className="text-[11px] text-gray-500">
                    <span className="text-gray-400">{act.username || '系统'}</span>
                    <span className="mx-1 text-gray-300">·</span>
                    {act.detail || act.action}
                    <span className="ml-1.5 text-gray-400">{new Date(act.created_at).toLocaleDateString('zh-CN')}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
