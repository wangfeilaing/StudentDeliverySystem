import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import { saveUpload, deleteIpFiles } from '@/lib/storage';
import { logOperation } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const id = parseId(await params);
    const ip = db.prepare(`
      SELECT ip.*,
        (SELECT COUNT(*) FROM social_account WHERE ip_id = ip.id) as account_count,
        (SELECT COUNT(*) FROM screenshot WHERE ip_id = ip.id AND deleted_at IS NULL) as screenshot_count,
        (SELECT COUNT(*) FROM video WHERE ip_id = ip.id AND deleted_at IS NULL) as video_count
      FROM ip WHERE id = ? AND deleted_at IS NULL
    `).get(id);

    if (!ip) return errorResponse('IP 不存在', 404);
    return jsonResponse(ip);
  } catch (e) {
    return errorResponse((e as Error).message, isNaN(parseId(await params)) ? 400 : 500);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM ip WHERE id = ? AND deleted_at IS NULL").get(id) as Record<string, unknown> | undefined;
    if (!existing) return errorResponse('IP 不存在', 404);

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const category = (formData.get('category') as string) || '';
    const tags = (formData.get('tags') as string) || '';
    const description = (formData.get('description') as string) || '';
    const status = (formData.get('status') as string) || 'active';
    const realName = (formData.get('real_name') as string) || '';
    const nickname = (formData.get('nickname') as string) || '';
    const gender = (formData.get('gender') as string) || '';
    const birthday = (formData.get('birthday') as string) || '';
    const phone = (formData.get('phone') as string) || '';
    const wechat = (formData.get('wechat') as string) || '';
    const email = (formData.get('email') as string) || '';
    const location = (formData.get('location') as string) || '';
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
      const product = db.prepare("SELECT price FROM product_types WHERE id = ?").get(productTypeId) as { price: number } | undefined;
      if (product) {
        if (product.price === 6980) serviceTier = '6980';
        else if (product.price === 19800) serviceTier = '19800';
        else serviceTier = 'cooperation';
      }
    }

    if (!name || !name.trim()) return errorResponse('名称不能为空', 400);

    let avatarPath = (existing.avatar_path as string) || '';

    const avatarFile = formData.get('avatar') as File | null;
    if (avatarFile && avatarFile.size > 0) {
      const buffer = Buffer.from(await avatarFile.arrayBuffer());
      const result = saveUpload(buffer, avatarFile.name, 'avatars', id);
      avatarPath = result.filePath;
    }

    db.prepare(`
      UPDATE ip SET name=@name, category=@category, tags=@tags, description=@description,
        avatar_path=@avatar_path, status=@status,
        real_name=@realName, nickname=@nickname, gender=@gender, birthday=@birthday,
        phone=@phone, wechat=@wechat, email=@email, location=@location,
        cooperation_type=@cooperationType, cooperation_start_date=@coopStartDate, cooperation_end_date=@coopEndDate,
        owner_user_id=@ownerUserId, business_user_id=@businessUserId, content_user_id=@contentUserId,
        id_card=@idCard, bank_account=@bankAccount, bank_address=@bankAddress,
        contract_no=@contractNo, emergency_contact=@emergencyContact, sensitive_notes=@sensitiveNotes,
        service_tier=@serviceTier, paid_amount=@paidAmount, product_type_id=@productTypeId,
        course_start_date=@courseStartDate, batch_number=@batchNumber,
        updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({
      name: name.trim(), category, tags, description, avatar_path: avatarPath, status, id,
      realName, nickname, gender, birthday, phone, wechat, email, location,
      cooperationType, coopStartDate, coopEndDate, ownerUserId, businessUserId, contentUserId,
      idCard, bankAccount, bankAddress, contractNo, emergencyContact, sensitiveNotes, serviceTier,
      paidAmount, productTypeId, courseStartDate, batchNumber,
    });

    // Only regenerate tasks when product_type_id or course_start_date explicitly changes
    const oldProductTypeId = existing.product_type_id as number | null;
    const oldCourseStartDate = (existing.course_start_date as string) || '';
    const newCourseStart = courseStartDate || '';
    const effectiveCourseStart = courseStartDate || coopStartDate || new Date().toISOString().split('T')[0];

    if (productTypeId !== oldProductTypeId || newCourseStart !== oldCourseStartDate) {
      const existingTaskCount = (db.prepare(
        "SELECT COUNT(*) as c FROM client_delivery_tasks WHERE client_id = ? AND template_id IS NOT NULL"
      ).get(id) as { c: number }).c;

      if (existingTaskCount > 0) {
        db.prepare("DELETE FROM client_delivery_tasks WHERE client_id = ? AND template_id IS NOT NULL").run(id);
      }

      if (productTypeId) {
        const templates = db.prepare(
          "SELECT * FROM delivery_templates WHERE product_type_id = ? AND status = 'active' ORDER BY sort_order ASC"
        ).all(productTypeId) as Array<{
          id: number; stage_name: string; task_name: string; description: string;
          due_day_offset: number; sort_order: number; is_required: number;
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
              insertTask.run(id, t.id, t.stage_name, t.task_name, t.description, dueDateStr, t.sort_order, t.is_required, t.copy_text || '', t.feishu_doc_url || '');
            }
          });
          generateAll();
        }
      }
    }

    await logOperation('update', 'ip', id, `编辑了 IP「${name.trim()}」`);

    const ip = db.prepare("SELECT * FROM ip WHERE id = ?").get(id);
    return jsonResponse(ip);
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['super_admin', 'admin']);
    const db = getDb();
    const id = parseId(await params);
    const existing = db.prepare("SELECT * FROM ip WHERE id = ? AND deleted_at IS NULL").get(id) as Record<string, unknown> | undefined;
    if (!existing) return errorResponse('IP 不存在', 404);

    // Soft delete IP and its screenshots/videos
    db.prepare("UPDATE ip SET deleted_at = datetime('now','localtime') WHERE id = ?").run(id);
    db.prepare("UPDATE screenshot SET deleted_at = datetime('now','localtime') WHERE ip_id = ? AND deleted_at IS NULL").run(id);
    db.prepare("UPDATE video SET deleted_at = datetime('now','localtime') WHERE ip_id = ? AND deleted_at IS NULL").run(id);

    await logOperation('delete', 'ip', id, `删除了 IP「${existing.name}」`);
    return jsonResponse({ success: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    if ((e as Error).message === 'FORBIDDEN') return errorResponse('无权限', 403);
    return errorResponse((e as Error).message);
  }
}
