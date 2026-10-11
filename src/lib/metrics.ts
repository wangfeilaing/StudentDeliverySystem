import { getDb } from './db';

/**
 * 营收与交付指标的唯一口径来源。
 *
 * 背景：仪表盘的「总收款」以前有两个不同的算法 —— 页面（src/app/page.tsx）用
 * 「paid_amount 有值就用它，否则回退产品标价」，接口（/api/dashboard）只看 paid_amount。
 * 同一个数字在两处显示不一样，属于典型的口径漂移。这里统一成一份实现，两边都调用它。
 *
 * 口径定义（与业务确认过）：
 *   1. 实收：ip.paid_amount 字段，人工登记的到账金额；
 *   2. 应收/合同额：ip.paid_amount 未登记时，按所购产品标价（product_types.price）估算；
 *   3. 营收口径 = 优先实收，无实收则用标价估算 —— 页面的「总收款」用这个；
 *      「已登记实收」用第 1 条单独展示，两者都返回，避免混为一谈。
 */

export interface RevenueByTier {
  label: string;
  ipCount: number;
  revenue: number;
}

export interface RevenueSummary {
  /** 营收（优先实收，缺失时用产品标价估算） */
  totalRevenue: number;
  /** 仅人工登记的实收合计 */
  actualPaid: number;
  /** 已登记实收的客户数 */
  paidCount: number;
  /** 未删除客户总数 */
  totalIpCount: number;
  monthRevenue: number;
  byTier: RevenueByTier[];
}

export function getRevenueSummary(): RevenueSummary {
  const db = getDb();

  const head = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN ip.paid_amount > 0 THEN ip.paid_amount ELSE COALESCE(pt.price, 0) END), 0) AS total_revenue,
      COALESCE(SUM(ip.paid_amount), 0) AS actual_paid,
      COUNT(CASE WHEN ip.paid_amount > 0 THEN 1 END) AS paid_count,
      COUNT(*) AS total_ip_count
    FROM ip
    LEFT JOIN product_types pt ON ip.product_type_id = pt.id
    WHERE ip.deleted_at IS NULL
  `).get() as { total_revenue: number; actual_paid: number; paid_count: number; total_ip_count: number };

  const monthRevenue = (db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN ip.paid_amount > 0 THEN ip.paid_amount ELSE COALESCE(pt.price, 0) END), 0) AS t
     FROM ip LEFT JOIN product_types pt ON ip.product_type_id = pt.id
     WHERE ip.deleted_at IS NULL AND ip.updated_at >= datetime('now', 'start of month', 'localtime')`
  ).get() as { t: number }).t;

  const byTier = (db.prepare(`
    SELECT
      CASE
        WHEN ip.service_tier = '6980' THEN '21天训练营'
        WHEN ip.service_tier = '19800' THEN '破局起飞计划'
        WHEN ip.service_tier = 'cooperation' THEN '千万联盟'
        ELSE '未分类'
      END AS label,
      COUNT(*) AS ip_count,
      COALESCE(SUM(CASE WHEN ip.paid_amount > 0 THEN ip.paid_amount ELSE COALESCE(pt.price, 0) END), 0) AS revenue
    FROM ip
    LEFT JOIN product_types pt ON ip.product_type_id = pt.id
    WHERE ip.deleted_at IS NULL
    GROUP BY ip.service_tier
    ORDER BY revenue DESC
  `).all() as Array<{ label: string; ip_count: number; revenue: number }>)
    .map(r => ({ label: r.label, ipCount: r.ip_count, revenue: r.revenue }));

  return {
    totalRevenue: head.total_revenue,
    actualPaid: head.actual_paid,
    paidCount: head.paid_count,
    totalIpCount: head.total_ip_count,
    monthRevenue,
    byTier,
  };
}

export interface DeliverySummary {
  /** 全部交付任务数（含已软删除客户的任务，指标口径为「系统内全部任务」） */
  totalTasks: number;
  completedTasks: number;
  /** 完成率，按任务条数计算 */
  avgProgress: number;
  /** 仅统计未删除客户的逾期任务 */
  overdueTasks: number;
  atRiskCount: number;
}

export function getDeliverySummary(): DeliverySummary {
  const db = getDb();
  const totalTasks = (db.prepare('SELECT COUNT(*) AS c FROM client_delivery_tasks').get() as { c: number }).c;
  const completedTasks = (db.prepare("SELECT COUNT(*) AS c FROM client_delivery_tasks WHERE status = 'completed'").get() as { c: number }).c;
  const overdueTasks = (db.prepare(
    `SELECT COUNT(*) AS c FROM client_delivery_tasks cdt JOIN ip ON ip.id = cdt.client_id
     WHERE cdt.status != 'completed' AND cdt.status != 'cancelled'
       AND cdt.due_date < date('now','localtime') AND ip.deleted_at IS NULL`
  ).get() as { c: number }).c;
  const atRiskCount = (db.prepare(
    `SELECT COUNT(*) AS c FROM ip WHERE ip.deleted_at IS NULL AND ip.status = 'active'
       AND EXISTS (SELECT 1 FROM client_delivery_tasks
                   WHERE client_id = ip.id AND status != 'completed' AND status != 'cancelled'
                     AND due_date < date('now','localtime'))`
  ).get() as { c: number }).c;

  return {
    totalTasks,
    completedTasks,
    avgProgress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    overdueTasks,
    atRiskCount,
  };
}

export interface OrderStats {
  /** 未取消订单数（status 30/100） */
  activeOrderCount: number;
  /** 全部订单数 */
  totalOrderCount: number;
  /** 平均订单金额（元），来自订单表，不写死 */
  avgOrderAmount: number;
  /** 订单金额合计（元） */
  totalOrderAmount: number;
  /** 是否提供了投放成本单价（元/单），用于盈亏估算 */
  hasCostModel: boolean;
}

/**
 * 订单侧统计。注意金额单位：视频号小店接口返回的 *_price 字段单位是「分」，
 * wechat-store.ts 在入库时已统一除以 100 存成「元」，这里直接按元使用。
 * 页面里的盈亏模型以前把「每单 5.2 元」写死在源码里，商品一调价就会静默算错，
 * 现在改为从真实订单数据推导平均客单价。
 */
export function getOrderStats(): OrderStats {
  const db = getDb();
  const row = db.prepare(
    `SELECT
       COUNT(*) AS total_order_count,
       COUNT(CASE WHEN status IN (30, 100) THEN 1 END) AS active_order_count,
       COALESCE(SUM(order_amount), 0) AS total_amount,
       COALESCE(AVG(order_amount), 0) AS avg_amount
     FROM wechat_orders`
  ).get() as { total_order_count: number; active_order_count: number; total_amount: number; avg_amount: number };

  return {
    activeOrderCount: row.active_order_count,
    totalOrderCount: row.total_order_count,
    avgOrderAmount: Math.round(row.avg_amount * 100) / 100,
    totalOrderAmount: Math.round(row.total_amount * 100) / 100,
    hasCostModel: true,
  };
}
