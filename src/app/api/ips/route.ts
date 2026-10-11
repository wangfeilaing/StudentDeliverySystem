import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parsePagination } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { saveUpload } from '@/lib/storage';
import { logOperation } from '@/lib/logger';


export async function GET(request: Request) {
  try {
    const db = getDb();
    const url = new URL(request.url);
    const search = url.searchParams.get('q') || '';
    const category = url.searchParams.get('category') || '';
    const serviceTier = url.searchParams.get('service_tier') || '';
    const status = url.searchParams.get('status') || 'active';
    const { page, limit, offset } = parsePagination(request);

    let where = "WHERE ip.deleted_at IS NULL";
    const params: Record<string, string | number> = {};

    if (search) {
      where += " AND (name LIKE @search OR tags LIKE @search OR description LIKE @search)";
      params.search = `%${search}%`;
    }
    if (category) {
      where += " AND category = @category";
      params.category = category;
    }
    if (serviceTier) {
      where += " AND service_tier = @serviceTier";
      params.serviceTier = serviceTier;
    }
    const batchNumber = url.searchParams.get('batch_number') || '';
    if (batchNumber) {
      where += " AND batch_number = @batchNumber";
      params.batchNumber = batchNumber;
    }
    if (status) {
      where += " AND status = @status";
      params.status = status;
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM ip ${where}`).get(params) as { count: number };
    const items = db.prepare(`
      SELECT ip.*,
        (SELECT COUNT(*) FROM social_account WHERE ip_id = ip.id) as account_count,
        (SELECT COUNT(*) FROM screenshot WHERE ip_id = ip.id AND deleted_at IS NULL) as screenshot_count,
        (SELECT COUNT(*) FROM video WHERE ip_id = ip.id AND deleted_at IS NULL) as video_count
      FROM ip ${where}
      ORDER BY ip.sort_order ASC, ip.updated_at DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });

    return jsonResponse({
      items,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit),
    });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const formData = await request.formData();

    const name = formData.get('name') as string;
    const category = (formData.get('category') as string) || '';
    const tags = (formData.get('tags') as string) || '';
    const description = (formData.get('description') as string) || '';
    const realName = (formData.get('real_name') as string) || '';
    const nickname = (formData.get('nickname') as string) || '';
    const gender = (formData.get('gender') as string) || '';
    const birthday = (formData.get('birthday') as string) || '';
    const phone = (formData.get('phone') as string) || '';
    const wechat = (formData.get('wechat') as string) || '';
    const email = (formData.get('email') as string) || '';
    const location = (formData.get('location') as string) || '';
    const status = (formData.get('status') as string) || 'active';
    const cooperationType = (formData.get('cooperation_type') as string) || '';
    const coopStartDate = (formData.get('cooperation_start_date') as string) || '';
    const coopEndDate = (formData.get('cooperation_end_date') as string) || '';
    const ownerUserId = parseInt((formData.get('owner_user_id') as string) || '0') || null;
    const businessUserId = parseInt((formData.get('business_user_id') as string) || '0') || null;
    const contentUserId = parseInt((formData.get('content_user_id') as string) || '0') || null;
    const idCard = (formData.get('id_card') as string) || '';
    const bankAccount = (formData.get('bank_account') as string) || '';
    const bankAddress = (formData.get('bank_address') as string) || '';
    const contractNo = (formData.get('contract_no') as string) || '';
    const emergencyContact = (formData.get('emergency_contact') as string) || '';
    const sensitiveNotes = (formData.get('sensitive_notes') as string) || '';
    let serviceTier = (formData.get('service_tier') as string) || '';
    const paidAmount = parseFloat((formData.get('paid_amount') as string) || '0') || 0;
    const productTypeId = parseInt((formData.get('product_type_id') as string) || '0') || null;
    const courseStartDate = (formData.get('course_start_date') as string) || '';
    const batchNumber = (formData.get('batch_number') as string) || '';

    // Auto-derive service_tier from product_type when not explicitly set
    if (!serviceTier && productTypeId) {
      const product = db.prepare("SELECT price, name FROM product_types WHERE id = ?").get(productTypeId) as { price: number; name: string } | undefined;
      if (product) {
        if (product.price === 6980) serviceTier = '6980';
        else if (product.price === 19800) serviceTier = '19800';
        else serviceTier = 'cooperation';
      }
    }

    // If course_start_date not set, default to cooperation_start_date
    const effectiveCourseStart = courseStartDate || coopStartDate || new Date().toISOString().split('T')[0];

    if (!name || !name.trim()) {
      return errorResponse('名称不能为空', 400);
    }

    const coopStart = coopStartDate || new Date().toISOString().split('T')[0];

    const result = db.prepare(`
      INSERT INTO ip (name, category, tags, description, real_name, nickname, gender, birthday, phone, wechat, email, location,
        status, cooperation_type, cooperation_start_date, cooperation_end_date, owner_user_id, business_user_id, content_user_id,
        id_card, bank_account, bank_address, contract_no, emergency_contact, sensitive_notes, service_tier, paid_amount, product_type_id, course_start_date, batch_number)
      VALUES (@name, @category, @tags, @description, @realName, @nickname, @gender, @birthday, @phone, @wechat, @email, @location,
        @status, @cooperationType, @coopStartDate, @coopEndDate, @ownerUserId, @businessUserId, @contentUserId,
        @idCard, @bankAccount, @bankAddress, @contractNo, @emergencyContact, @sensitiveNotes, @serviceTier, @paidAmount, @productTypeId, @courseStartDate, @batchNumber)
    `).run({
      name: name.trim(), category, tags, description,
      realName, nickname, gender, birthday, phone, wechat, email, location,
      status, cooperationType, coopStartDate, coopEndDate, ownerUserId, businessUserId, contentUserId,
      idCard, bankAccount, bankAddress, contractNo, emergencyContact, sensitiveNotes, serviceTier,
      paidAmount, productTypeId, courseStartDate: effectiveCourseStart, batchNumber,
    });

    const ipId = result.lastInsertRowid as number;

    // Auto-generate delivery tasks from product template
    if (productTypeId) {
      const templates = db.prepare(
        "SELECT * FROM delivery_templates WHERE product_type_id = ? AND status = 'active' ORDER BY sort_order ASC"
      ).all(productTypeId) as Array<{
        id: number; stage_name: string; task_name: string; description: string;
        due_day_offset: number; sort_order: number; is_required: number; default_role: string;
        copy_text: string; feishu_doc_url: string;
      }>;

      if (templates.length > 0) {
        const insertTask = db.prepare(`
          INSERT INTO client_delivery_tasks (client_id, template_id, stage_name, task_name, description, status, due_date, sort_order, is_required, copy_text, feishu_doc_url)
          VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?)
        `);

        const generateAll = db.transaction(() => {
          for (const t of templates) {
            const dueDate = new Date(effectiveCourseStart + 'T00:00:00');
            dueDate.setDate(dueDate.getDate() + t.due_day_offset);
            const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
            insertTask.run(ipId, t.id, t.stage_name, t.task_name, t.description, dueDateStr, t.sort_order, t.is_required, t.copy_text || '', t.feishu_doc_url || '');
          }
        });
        generateAll();

        // Log the task generation
        db.prepare(`
          INSERT INTO delivery_logs (client_id, operator_id, operator_name, action_type, content)
          VALUES (?, NULL, 'system', 'create_client', ?)
        `).run(ipId, `自动生成了 ${templates.length} 个交付任务`);
      }
    }

    const avatarFile = formData.get('avatar') as File | null;
    if (avatarFile && avatarFile.size > 0) {
      const buffer = Buffer.from(await avatarFile.arrayBuffer());
      const { filePath } = saveUpload(buffer, avatarFile.name, 'avatars', ipId);
      db.prepare("UPDATE ip SET avatar_path = ? WHERE id = ?").run(filePath, ipId);
    }

    await logOperation('create', 'ip', ipId, `创建了 IP「${name.trim()}」`);

    const ip = db.prepare("SELECT * FROM ip WHERE id = ?").get(ipId);
    return jsonResponse(ip, 201);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
