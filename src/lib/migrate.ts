import Database from 'better-sqlite3';
import crypto from 'crypto';

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`
  ).get() as { cnt: number };
  return row.cnt > 0;
}

export function runMigrations(db: Database.Database) {
  // ---- existing tables ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      avatar_path TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_ip_category ON ip(category);
    CREATE INDEX IF NOT EXISTS idx_ip_status ON ip(status);
    CREATE INDEX IF NOT EXISTS idx_ip_name ON ip(name);

    CREATE TABLE IF NOT EXISTS social_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_url TEXT NOT NULL DEFAULT '',
      follower_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_account_ip ON social_account(ip_id);

    CREATE TABLE IF NOT EXISTS screenshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_screenshot_ip ON screenshot(ip_id);

    CREATE TABLE IF NOT EXISTS video (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      duration INTEGER,
      thumbnail_path TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_video_ip ON video(ip_id);
  `);

  // ---- avatar_path column for users (idempotent) ----
  if (!columnExists(db, 'users', 'avatar_path')) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_path TEXT;");
  }
  if (!columnExists(db, 'users', 'phone')) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';");
  }
  if (!columnExists(db, 'users', 'last_login_at')) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT;");
  }

  // ---- soft delete columns (idempotent) ----
  if (!columnExists(db, 'ip', 'deleted_at')) {
    db.exec("ALTER TABLE ip ADD COLUMN deleted_at TEXT;");
  }
  if (!columnExists(db, 'screenshot', 'deleted_at')) {
    db.exec("ALTER TABLE screenshot ADD COLUMN deleted_at TEXT;");
  }
  if (!columnExists(db, 'video', 'deleted_at')) {
    db.exec("ALTER TABLE video ADD COLUMN deleted_at TEXT;");
  }

  // ---- expanded IP columns (idempotent) ----
  const ipColumns: [string, string][] = [
    ['real_name', 'TEXT NOT NULL DEFAULT \'\''],
    ['nickname', 'TEXT NOT NULL DEFAULT \'\''],
    ['gender', 'TEXT NOT NULL DEFAULT \'\''],
    ['birthday', 'TEXT NOT NULL DEFAULT \'\''],
    ['phone', 'TEXT NOT NULL DEFAULT \'\''],
    ['wechat', 'TEXT NOT NULL DEFAULT \'\''],
    ['email', 'TEXT NOT NULL DEFAULT \'\''],
    ['location', 'TEXT NOT NULL DEFAULT \'\''],
    ['cooperation_type', 'TEXT NOT NULL DEFAULT \'\''],
    ['cooperation_start_date', 'TEXT NOT NULL DEFAULT \'\''],
    ['cooperation_end_date', 'TEXT NOT NULL DEFAULT \'\''],
    ['owner_user_id', 'INTEGER'],
    ['business_user_id', 'INTEGER'],
    ['content_user_id', 'INTEGER'],
    ['id_card', 'TEXT NOT NULL DEFAULT \'\''],
    ['bank_account', 'TEXT NOT NULL DEFAULT \'\''],
    ['bank_address', 'TEXT NOT NULL DEFAULT \'\''],
    ['contract_no', 'TEXT NOT NULL DEFAULT \'\''],
    ['emergency_contact', 'TEXT NOT NULL DEFAULT \'\''],
    ['sensitive_notes', 'TEXT NOT NULL DEFAULT \'\''],
  ];
  for (const [col, def] of ipColumns) {
    if (!columnExists(db, 'ip', col)) {
      db.exec(`ALTER TABLE ip ADD COLUMN ${col} ${def};`);
    }
  }

  // ---- service_tier for IP service tier classification ----
  if (!columnExists(db, 'ip', 'service_tier')) {
    db.exec("ALTER TABLE ip ADD COLUMN service_tier TEXT NOT NULL DEFAULT '';");
  }

  // ---- sort_order for IP ordering ----
  if (!columnExists(db, 'ip', 'sort_order')) {
    db.exec("ALTER TABLE ip ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;");
    // Seed existing IPs with sequential sort_order based on id
    const ips = db.prepare("SELECT id FROM ip WHERE deleted_at IS NULL ORDER BY updated_at DESC").all() as Array<{ id: number }>;
    const update = db.prepare("UPDATE ip SET sort_order = ? WHERE id = ?");
    ips.forEach((ip, i) => update.run(i, ip.id));
  }

  // ---- thumbnail and is_sensitive for screenshots/videos ----
  if (!columnExists(db, 'screenshot', 'thumbnail_path')) {
    db.exec("ALTER TABLE screenshot ADD COLUMN thumbnail_path TEXT;");
  }
  if (!columnExists(db, 'screenshot', 'is_sensitive')) {
    db.exec("ALTER TABLE screenshot ADD COLUMN is_sensitive INTEGER NOT NULL DEFAULT 0;");
  }
  if (!columnExists(db, 'video', 'thumbnail_path')) {
    db.exec("ALTER TABLE video ADD COLUMN thumbnail_path TEXT;");
  }
  if (!columnExists(db, 'video', 'is_sensitive')) {
    db.exec("ALTER TABLE video ADD COLUMN is_sensitive INTEGER NOT NULL DEFAULT 0;");
  }

  // ---- CRM: paid_amount and product_type_id for ip table ----
  if (!columnExists(db, 'ip', 'paid_amount')) {
    db.exec("ALTER TABLE ip ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0;");
  }
  if (!columnExists(db, 'ip', 'product_type_id')) {
    db.exec("ALTER TABLE ip ADD COLUMN product_type_id INTEGER;");
  }
  if (!columnExists(db, 'ip', 'course_start_date')) {
    db.exec("ALTER TABLE ip ADD COLUMN course_start_date TEXT NOT NULL DEFAULT '';");
  }
  if (!columnExists(db, 'ip', 'batch_number')) {
    db.exec("ALTER TABLE ip ADD COLUMN batch_number TEXT NOT NULL DEFAULT '';");
  }

  // ---- copy_text for delivery templates & tasks ----
  if (!columnExists(db, 'delivery_templates', 'copy_text')) {
    db.exec("ALTER TABLE delivery_templates ADD COLUMN copy_text TEXT NOT NULL DEFAULT '';");
  }
  if (!columnExists(db, 'client_delivery_tasks', 'copy_text')) {
    db.exec("ALTER TABLE client_delivery_tasks ADD COLUMN copy_text TEXT NOT NULL DEFAULT '';");
  }

  // ---- feishu doc url for delivery templates & tasks ----
  if (!columnExists(db, 'delivery_templates', 'feishu_doc_url')) {
    db.exec("ALTER TABLE delivery_templates ADD COLUMN feishu_doc_url TEXT NOT NULL DEFAULT '';");
  }
  if (!columnExists(db, 'client_delivery_tasks', 'feishu_doc_url')) {
    db.exec("ALTER TABLE client_delivery_tasks ADD COLUMN feishu_doc_url TEXT NOT NULL DEFAULT '';");
  }

  // ---- stage progress tracking ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_stage_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      stage_name TEXT NOT NULL,
      completed_at TEXT,
      completed_by INTEGER,
      UNIQUE(ip_id, stage_name)
    );
  `);

  // ---- feishu doc url for ip ----
  if (!columnExists(db, 'ip', 'feishu_doc_url')) {
    db.exec("ALTER TABLE ip ADD COLUMN feishu_doc_url TEXT NOT NULL DEFAULT '';");
  }

  // ---- feishu bidirectional sync ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS feishu_block_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      block_type TEXT NOT NULL,
      system_entity_type TEXT NOT NULL,
      system_entity_ref TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(document_id, block_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fbm_ip ON feishu_block_mappings(ip_id);
    CREATE INDEX IF NOT EXISTS idx_fbm_doc ON feishu_block_mappings(document_id);

    CREATE TABLE IF NOT EXISTS feishu_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      trigger TEXT NOT NULL,
      changes_detected INTEGER NOT NULL DEFAULT 0,
      changes_applied INTEGER NOT NULL DEFAULT 0,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      triggered_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_fsl_ip ON feishu_sync_log(ip_id);
    CREATE INDEX IF NOT EXISTS idx_fsl_created ON feishu_sync_log(created_at);

    CREATE TABLE IF NOT EXISTS ip_feishu_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      document_name TEXT NOT NULL,
      feishu_doc_url TEXT NOT NULL DEFAULT '',
      document_id TEXT NOT NULL DEFAULT '',
      obj_type TEXT NOT NULL DEFAULT 'docx',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_ip_feishu_docs_ip ON ip_feishu_docs(ip_id);
  `);

  // ---- wechat store orders ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS wechat_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL UNIQUE,
      status INTEGER NOT NULL DEFAULT 0,
      buyer_name TEXT NOT NULL DEFAULT '',
      buyer_phone TEXT NOT NULL DEFAULT '',
      buyer_province TEXT NOT NULL DEFAULT '',
      buyer_city TEXT NOT NULL DEFAULT '',
      buyer_address TEXT NOT NULL DEFAULT '',
      product_names TEXT NOT NULL DEFAULT '',
      product_count INTEGER NOT NULL DEFAULT 0,
      order_amount REAL NOT NULL DEFAULT 0,
      payment_method INTEGER,
      pay_time TEXT,
      create_time TEXT NOT NULL DEFAULT '',
      update_time TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_wechat_orders_status ON wechat_orders(status);
    CREATE INDEX IF NOT EXISTS idx_wechat_orders_create_time ON wechat_orders(create_time);
  `);

  if (!columnExists(db, 'wechat_orders', 'remark')) {
    db.prepare("ALTER TABLE wechat_orders ADD COLUMN remark TEXT NOT NULL DEFAULT ''").run();
  }

  // Sales assignment table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // ---- WeChat Work (企微) integration ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS wecom_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      corp_id TEXT NOT NULL UNIQUE,
      secret TEXT NOT NULL,
      callback_token TEXT NOT NULL DEFAULT '',
      aes_key TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS wecom_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL REFERENCES wecom_config(id) ON DELETE CASCADE,
      sales_name TEXT NOT NULL,
      wecom_userid TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_wecom_staff_sales ON wecom_staff(sales_name);

    CREATE TABLE IF NOT EXISTS wecom_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES wechat_orders(order_id) ON DELETE CASCADE,
      sales_name TEXT NOT NULL,
      external_userid TEXT NOT NULL DEFAULT '',
      contact_name TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      added_at TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_wecom_bindings_order ON wecom_bindings(order_id);
    CREATE INDEX IF NOT EXISTS idx_wecom_bindings_sales ON wecom_bindings(sales_name);
  `);

  if (!columnExists(db, 'wecom_bindings', 'state')) {
    db.exec("ALTER TABLE wecom_bindings ADD COLUMN state TEXT NOT NULL DEFAULT '';");
  }
  if (!columnExists(db, 'wecom_bindings', 'match_method')) {
    db.exec("ALTER TABLE wecom_bindings ADD COLUMN match_method TEXT NOT NULL DEFAULT 'name_time';");
  }
  if (!columnExists(db, 'wecom_bindings', 'confidence')) {
    db.exec("ALTER TABLE wecom_bindings ADD COLUMN confidence INTEGER NOT NULL DEFAULT 70;");
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wecom_bindings_unique_order_external
      ON wecom_bindings(order_id, external_userid);

    CREATE TABLE IF NOT EXISTS wecom_contact_ways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL REFERENCES wecom_config(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES wecom_staff(id) ON DELETE SET NULL,
      sales_name TEXT NOT NULL,
      wecom_userid TEXT NOT NULL,
      state TEXT NOT NULL UNIQUE,
      remark TEXT NOT NULL DEFAULT '',
      contact_way_config_id TEXT NOT NULL DEFAULT '',
      qr_code TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_wecom_contact_ways_sales ON wecom_contact_ways(sales_name);
    CREATE INDEX IF NOT EXISTS idx_wecom_contact_ways_state ON wecom_contact_ways(state);
  `);

  // ---- 站内通知（销售加企微 / 系统消息等） ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'system',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      order_id TEXT NOT NULL DEFAULT '',
      sales_name TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
  `);

  // ---- CRM new tables ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      service_days INTEGER NOT NULL DEFAULT 90,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS delivery_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
      stage_name TEXT NOT NULL DEFAULT '',
      task_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_day_offset INTEGER NOT NULL DEFAULT 7,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_required INTEGER NOT NULL DEFAULT 1,
      default_role TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_templates_product ON delivery_templates(product_type_id);

    CREATE TABLE IF NOT EXISTS client_delivery_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      template_id INTEGER,
      stage_name TEXT NOT NULL DEFAULT '',
      task_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'not_started',
      due_date TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      completed_by INTEGER,
      owner_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_required INTEGER NOT NULL DEFAULT 1,
      completion_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON client_delivery_tasks(client_id);
    CREATE INDEX IF NOT EXISTS idx_client_tasks_status ON client_delivery_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_client_tasks_due ON client_delivery_tasks(due_date);

    CREATE TABLE IF NOT EXISTS delivery_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      task_id INTEGER,
      operator_id INTEGER,
      operator_name TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      old_status TEXT NOT NULL DEFAULT '',
      new_status TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_client ON delivery_logs(client_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_task ON delivery_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_logs_created ON delivery_logs(created_at);

    CREATE TABLE IF NOT EXISTS task_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES client_delivery_tasks(id) ON DELETE SET NULL,
      log_id INTEGER REFERENCES delivery_logs(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_task_attachments_client ON task_attachments(client_id);
    CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);
  `);

  // Helper: generate script template text for lesson tasks
  function generateCopyText(taskName: string, description: string): string {
    const m = taskName.match(/^第(\d+)讲[：:]\s*(.+)/);
    if (!m) return '';
    const lessonNum = parseInt(m[1], 10);
    const topic = m[2];
    const instMatch = description.match(/主讲人[：:]\s*([^|]+)/);
    const instructor = instMatch ? instMatch[1].trim() : '';
    return `@所有人
咱们演示导师21天成长训练营，今晚7:30正式开课！

第${lessonNum}课主题：《${topic}》

主讲人：${instructor}

听课链接：

本群为专属多对一服务群，8位老师全程陪跑、一对一答疑，有问题随时在群内提问，准时上课，我们不见不散！`;
  }

  // ---- seed default product types ----
  const productCount = (db.prepare("SELECT COUNT(*) as cnt FROM product_types").get() as { cnt: number }).cnt;
  if (productCount === 0) {
    const insertProduct = db.prepare("INSERT INTO product_types (name, price, service_days, description, sort_order) VALUES (?, ?, ?, ?, ?)");
    insertProduct.run('21 天确定性获客训练营', 6980, 90, '基础 IP 诊断与内容规划服务', 1);
    insertProduct.run('高客单 IP 破局起飞计划', 19800, 180, '深度账号定位、内容体系搭建与复盘优化服务', 2);
    insertProduct.run('千万联盟计划', 0, 365, '签约大客户，自定义交付内容与周期', 3);

    // Seed delivery templates for 6980
    const insertTemplate = db.prepare(
      "INSERT INTO delivery_templates (product_type_id, stage_name, task_name, description, due_day_offset, sort_order, is_required, copy_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const t6980 = [
      ['阶段一：基础诊断', 'IP 定位诊断', '分析 IP 当前定位、受众画像与内容风格', 3, 1],
      ['阶段一：基础诊断', '账号主页优化', '优化头像、简介、封面等主页元素', 5, 2],
      ['阶段二：内容规划', '选题方向确认', '根据定位确定 3-5 个核心选题方向', 7, 3],
      ['阶段二：内容规划', '内容脚本交付', '交付首批 5 条视频脚本', 14, 4],
      ['阶段三：发布优化', '发布时间建议', '根据受众活跃时间给出发布排期', 21, 5],
      ['阶段三：发布优化', '首周数据复盘', '首周内容数据回顾与调整建议', 28, 6],
    ];
    t6980.forEach(([stage, task, desc, day, order]) => {
      insertTemplate.run(1, stage, task, desc, day, order as number, 1, '');
    });

    // Seed delivery templates for 19800
    const t19800 = [
      ['阶段一：账号定位', 'IP 定位诊断', '深度分析 IP 定位、差异化优势', 3, 1],
      ['阶段一：账号定位', '竞品分析报告', '分析 3-5 个竞品账号的内容策略', 5, 2],
      ['阶段一：账号定位', '账号主页优化', '全面优化账号主页所有元素', 7, 3],
      ['阶段二：内容体系搭建', '选题库搭建', '建立 20+ 选题的内容选题库', 10, 4],
      ['阶段二：内容体系搭建', '脚本交付（第1批）', '交付前 10 条视频脚本', 14, 5],
      ['阶段二：内容体系搭建', '拍摄指导', '提供拍摄参数、场景、灯光建议', 18, 6],
      ['阶段二：内容体系搭建', '脚本交付（第2批）', '交付第 11-20 条视频脚本', 28, 7],
      ['阶段三：运营指导', '发布策略制定', '制定周度发布排期与流量策略', 35, 8],
      ['阶段三：运营指导', '评论区运营指南', '评论互动策略与话术模板', 42, 9],
      ['阶段四：复盘优化', '月度数据复盘', '首月数据全面分析与优化建议', 60, 10],
      ['阶段四：复盘优化', '下一阶段规划', '制定下阶段内容与运营计划', 75, 11],
    ];
    t19800.forEach(([stage, task, desc, day, order]) => {
      insertTemplate.run(2, stage, task, desc, day, order as number, 1, '');
    });

    // Seed delivery templates for 签约合作 IP
    const tCoop = [
      ['阶段一：深度诊断', '全方位 IP 诊断', '内容、账号、商业模式的全面诊断', 7, 1],
      ['阶段一：深度诊断', '竞品与赛道分析', '赛道规模、竞品策略与机会点分析', 10, 2],
      ['阶段二：策略制定', '内容策略方案', '制定年度内容策略与增长路径', 21, 3],
      ['阶段二：策略制定', '商业变现规划', '多元化变现路径设计与排期', 30, 4],
    ];
    tCoop.forEach(([stage, task, desc, day, order]) => {
      insertTemplate.run(3, stage, task, desc, day, order as number, 1, '');
    });
  }

  // ---- upgrade 6980 templates to full course schedule ----
  const t6980Lesson6 = (db.prepare(
    "SELECT due_day_offset FROM delivery_templates WHERE product_type_id = 1 AND sort_order = 7"
  ).get() as { due_day_offset: number } | undefined);
  // Detect old patterns: sort_order=7 (第6讲) at offset 8 means old "8-day stage" schedule
  // Correct pattern: sort_order=7 at offset 7 (7-day stage: 5 lessons + 2 rest/assignment days)
  const needsUpdate = t6980Lesson6 && t6980Lesson6.due_day_offset !== 7;
  if (needsUpdate) {
    db.prepare("DELETE FROM delivery_templates WHERE product_type_id = 1").run();
  }
  const t6980Count = (db.prepare("SELECT COUNT(*) as cnt FROM delivery_templates WHERE product_type_id = 1").get() as { cnt: number }).cnt;
  if (t6980Count === 0) {
    const insertTpl = db.prepare(
      "INSERT INTO delivery_templates (product_type_id, stage_name, task_name, description, due_day_offset, sort_order, is_required, copy_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    // Schedule: 4 stages × 7 days = 5 lessons + 2 rest/assignment days; final ceremony on day 27
    const courses: [string, string, string, number, number, number][] = [
      // 第一阶段：搞定高客单定位（7天：5讲 + 2天休/做作业）
      ['第一阶段：搞定高客单定位', '第1讲：如何破解平台深度算法，零成本转化高净值客户？', '主讲人：演示导师 | 上课时间：19:30', 0, 1, 1],
      ['第一阶段：搞定高客单定位', '第2讲：如何打造高客单吸金人设，让100个粉丝顶10万个泛粉？', '主讲人：演示导师 | 上课时间：19:30', 1, 2, 1],
      ['第一阶段：搞定高客单定位', '第3讲：如何设计高客单账号主页，让客户看一眼就想下单？', '主讲人：宏亮 | 上课时间：19:30', 2, 3, 1],
      ['第一阶段：搞定高客单定位', '第4讲：如何写出高转化视频标题，一条视频转化100万营收？', '主讲人：太安 | 上课时间：19:30', 3, 4, 1],
      ['第一阶段：搞定高客单定位', '第5讲：如何套用万能下粉文案公式，写出发了必下客资的文案？', '主讲人：太安 | 上课时间：19:30', 4, 5, 1],
      ['第一阶段：搞定高客单定位', '实操作业：完成高转化账号主页搭建，产出你的第一支爆款收钱脚本！', '休2天做作业 | 上课时间：19:30', 5, 6, 1],
      // 第二阶段：搞定高质感成片（7天：5讲 + 2天休/做作业）
      ['第二阶段：搞定高质感成片', '第6讲：如何花几百块搭出百万级直播间质感，让刷到的人都驻足下单？', '主讲人：宏亮 | 上课时间：19:30', 7, 7, 1],
      ['第二阶段：搞定高质感成片', '第7讲：老板如何练就高转化镜头感，一开口就能成交30万客单？', '主讲人：太安 | 上课时间：19:30', 8, 8, 1],
      ['第二阶段：搞定高质感成片', '第8讲：如何利用手机拍出相机质感，为团队省下几万块器材费？', '主讲人：宏亮 | 上课时间：19:30', 9, 9, 1],
      ['第二阶段：搞定高质感成片', '第9讲：如何一键调出电影级画面色感，让同行看完就想抄？', '主讲人：宏亮 | 上课时间：19:30', 10, 10, 1],
      ['第二阶段：搞定高质感成片', '第10讲：如何建立高效剪辑流水线，一个人干出一个团队的产能？', '主讲人：耽悦 | 上课时间：19:30', 11, 11, 1],
      ['第二阶段：搞定高质感成片', '实操作业：跑通「拍摄-剪辑」全链路，完成高质感视频成片！', '休2天做作业 | 上课时间：19:30', 12, 12, 1],
      // 第三阶段：搞定千万营收杠杆（7天：5讲 + 2天休/做作业）
      ['第三阶段：搞定千万营收杠杆', '第11讲：如何用AI三分钟量产原创爆款文案，彻底解放双手降本增效？', '主讲人：宏亮 | 上课时间：19:30', 14, 13, 1],
      ['第三阶段：搞定千万营收杠杆', '第12讲：如何用100块撬动万元精准流量，稳赚不赔的放大生意？', '主讲人：太安 | 上课时间：19:30', 15, 14, 1],
      ['第三阶段：搞定千万营收杠杆', '第13讲：如何打通短直联动接住极速流，让单场直播业绩翻倍？', '主讲人：太安 | 上课时间：19:30', 16, 15, 1],
      ['第三阶段：搞定千万营收杠杆', '第14讲：如何在直播间套用销冠级留人憋单话术，把极速流量稳稳接住变现？', '主讲人：太安 | 上课时间：19:30', 17, 16, 1],
      ['第三阶段：搞定千万营收杠杆', '第15讲：老板如何通过数据复盘找出直播漏钱点，精准复盘让业绩螺旋式上升？', '主讲人：太安 | 上课时间：19:30', 18, 17, 1],
      ['第三阶段：搞定千万营收杠杆', '实操作业：理解直播间搭建及数据复盘思维并搭建自己的智能体', '休2天做作业 | 上课时间：19:30', 19, 18, 1],
      // 第四阶段：搞定被动成交私域（7天：5讲 + 1天作业 + 结营）
      ['第四阶段：搞定被动成交私域', '第16讲：如何设计私域全套高利润产品矩阵，开发客户LTV价值井喷爆炸裂变？', '主讲人：唐颜or博哥 | 上课时间：19:30', 21, 19, 1],
      ['第四阶段：搞定被动成交私域', '第17讲：如何打造超级引流钩子话术，让公域的高净值客户排队加你微信？', '主讲人：唐颜or博哥 | 上课时间：19:30', 22, 20, 1],
      ['第四阶段：搞定被动成交私域', '第18讲：如何一句话让刚加V的人快速建立信任，精准成交高客单？', '主讲人：唐颜or博哥 | 上课时间：19:30', 23, 21, 1],
      ['第四阶段：搞定被动成交私域', '第19讲：如何打造被动收钱的朋友圈，让客户越看越上头主动转账？', '主讲人：唐颜or博哥 | 上课时间：19:30', 24, 22, 1],
      ['第四阶段：搞定被动成交私域', '第20讲：如何掌握私聊逼单绝杀技，把「我考虑一下」变成「马上打款」？', '主讲人：唐颜or博哥 | 上课时间：19:30', 25, 23, 1],
      ['第四阶段：搞定被动成交私域', '实操作业：为自己设计一款高转化的引流课', '休2天做作业 | 上课时间：19:30', 26, 24, 1],
      ['第四阶段：搞定被动成交私域', '结营仪式', '', 27, 25, 1],
    ];
    for (const [stage, task, desc, day, order, required] of courses) {
      insertTpl.run(1, stage, task, desc, day, order, required, generateCopyText(task, desc));
    }
  }

  // ---- backfill copy_text for existing delivery_templates ----
  {
    const templates = db.prepare(
      "SELECT id, task_name, description FROM delivery_templates WHERE copy_text = ''"
    ).all() as Array<{ id: number; task_name: string; description: string }>;
    const updateTpl = db.prepare("UPDATE delivery_templates SET copy_text = ? WHERE id = ?");
    for (const t of templates) {
      const ct = generateCopyText(t.task_name, t.description);
      if (ct) updateTpl.run(ct, t.id);
    }
  }

  // ---- backfill copy_text for existing client_delivery_tasks ----
  {
    const tasks = db.prepare(
      "SELECT ct.id, ct.task_name, ct.description, dt.copy_text FROM client_delivery_tasks ct LEFT JOIN delivery_templates dt ON ct.template_id = dt.id WHERE ct.copy_text = ''"
    ).all() as Array<{ id: number; task_name: string; description: string; copy_text: string | null }>;
    const updateTask = db.prepare("UPDATE client_delivery_tasks SET copy_text = ? WHERE id = ?");
    for (const t of tasks) {
      if (t.copy_text) {
        updateTask.run(t.copy_text, t.id);
      }
    }
  }

  // ---- new tables ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'operator',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      group_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ip_tags (
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (ip_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS material_tags (
      material_id INTEGER NOT NULL,
      material_type TEXT NOT NULL CHECK(material_type IN ('screenshot','video')),
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (material_id, material_type, tag_id)
    );

    CREATE TABLE IF NOT EXISTS success_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      video_url TEXT NOT NULL DEFAULT '',
      publish_date TEXT NOT NULL DEFAULT '',
      play_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      favorite_count INTEGER NOT NULL DEFAULT 0,
      share_count INTEGER NOT NULL DEFAULT 0,
      conversion_result TEXT NOT NULL DEFAULT '',
      screenshot_ids TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_success_cases_ip ON success_cases(ip_id);

    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_id INTEGER NOT NULL REFERENCES ip(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      screenshot_ids TEXT NOT NULL DEFAULT '',
      reviewer_name TEXT NOT NULL DEFAULT '',
      related_project TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_feedbacks_ip ON feedbacks(ip_id);

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id INTEGER,
      detail TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_op_logs_created ON operation_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_op_logs_target ON operation_logs(target_type, target_id);

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // ---- seed data ----
  const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!adminExists) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('admin123', salt, 100000, 64, 'sha512').toString('hex');
    db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)"
    ).run('admin', `${salt}:${hash}`, '超级管理员', 'super_admin');
  }

  const catCount = (db.prepare("SELECT COUNT(*) as cnt FROM categories").get() as { cnt: number }).cnt;
  if (catCount === 0) {
    const cats = ['游戏', '美妆', '科技', '生活', '美食', '时尚', '知识', '音乐', '体育', '其他'];
    const insert = db.prepare("INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)");
    cats.forEach((c, i) => insert.run(c, i + 1));
  }

  // seed default settings
  db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)").run('upload_max_size_mb', '500');
  db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)").run('auto_backup_enabled', 'false');
  db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)").run('recycle_retention_days', '30');
  db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)").run('session_timeout_minutes', '1440');
  // 备份相关：auto_backup_enabled 决定是否在登录时自动备份；
  // last_backup_at 记录上次成功备份时间（ISO 字符串），供自动备份判断是否到期。
  db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)").run('backup_retention_days', '30');
  db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)").run('last_backup_at', '');

  // ---- rename product types to official names ----
  db.prepare("UPDATE product_types SET name = '21 天确定性获客训练营' WHERE id = 1 AND name != '21 天确定性获客训练营'").run();
  db.prepare("UPDATE product_types SET name = '高客单 IP 破局起飞计划' WHERE id = 2 AND name != '高客单 IP 破局起飞计划'").run();
  db.prepare("UPDATE product_types SET name = '千万联盟计划' WHERE id = 3 AND name != '千万联盟计划'").run();

  // Make sales_assignments.end_time nullable to support open-ended (active) assignments
  if (columnExists(db, 'sales_assignments', 'end_time')) {
    const info = db.prepare("PRAGMA table_info('sales_assignments')").all() as Array<{ name: string; notnull: number }>;
    const endCol = info.find(c => c.name === 'end_time');
    if (endCol && endCol.notnull === 1) {
      db.exec(`
        CREATE TABLE sales_assignments_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sales_name TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        INSERT INTO sales_assignments_new SELECT * FROM sales_assignments;
        DROP TABLE sales_assignments;
        ALTER TABLE sales_assignments_new RENAME TO sales_assignments;
      `);
    }
  }

  // ---- 内容工坊：采集 / 转写 / 改写 / 导出飞书 ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL DEFAULT 'manual',   -- manual | douyin_profile | douyin_batch | douyin_search
      platform TEXT NOT NULL DEFAULT 'douyin',
      author TEXT NOT NULL DEFAULT '',              -- 博主名
      author_url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',               -- 视频/文案标题
      original_text TEXT NOT NULL DEFAULT '',       -- 原始文案
      transcript TEXT NOT NULL DEFAULT '',          -- 语音转写结果(预留)
      rewritten_text TEXT NOT NULL DEFAULT '',      -- AI 改写结果(预留)
      digg_count INTEGER NOT NULL DEFAULT 0,        -- 点赞数
      comment_count INTEGER NOT NULL DEFAULT 0,
      share_count INTEGER NOT NULL DEFAULT 0,
      video_url TEXT NOT NULL DEFAULT '',
      download_url TEXT NOT NULL DEFAULT '',         -- 无水印下载地址(预留)
      cover_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',        -- pending | transcribed | rewritten | exported
      feishu_doc_url TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_items_source ON content_items(source_type);
    CREATE INDEX IF NOT EXISTS idx_content_items_digg ON content_items(digg_count);
    CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);
    CREATE INDEX IF NOT EXISTS idx_content_items_created ON content_items(created_at);
  `);

  // ---- AI 模型配置（多模型可切换：openai 兼容 / anthropic）----
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,                          -- 显示名，如 "DeepSeek"、"我的Claude"
      provider TEXT NOT NULL DEFAULT 'openai',     -- openai（含国产兼容） | anthropic
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',            -- 加密存储
      model TEXT NOT NULL DEFAULT '',              -- 模型名/ID
      is_default INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
}
