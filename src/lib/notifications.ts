import { getDb } from '@/lib/db';

export type NotificationType = 'wecom_added' | 'new_order' | 'system';

export interface NotificationRow {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  order_id: string;
  sales_name: string;
  is_read: number;
  created_at: string;
}

/** 写入一条站内通知。 */
export function createNotification(params: {
  type: NotificationType;
  title: string;
  body?: string;
  orderId?: string;
  salesName?: string;
}): void {
  getDb().prepare(
    `INSERT INTO notifications (type, title, body, order_id, sales_name)
     VALUES (@type, @title, @body, @orderId, @salesName)`
  ).run({
    type: params.type,
    title: params.title,
    body: params.body || '',
    orderId: params.orderId || '',
    salesName: params.salesName || '',
  });
}

export function listNotifications(limit = 50): NotificationRow[] {
  return getDb().prepare(
    `SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(limit) as NotificationRow[];
}

export function unreadCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0`).get() as { c: number }).c;
}

export function markRead(ids: number[]): void {
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  getDb().prepare(`UPDATE notifications SET is_read = 1 WHERE id IN (${ph})`).run(...ids);
}

export function markAllRead(): void {
  getDb().prepare(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`).run();
}
