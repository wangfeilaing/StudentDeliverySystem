import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse, parseId } from '@/lib/api-helpers';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const ipId = parseId(await params);
    const items = db.prepare(
      "SELECT * FROM operation_logs WHERE (target_type = 'ip' AND target_id = ?) OR target_type IN ('screenshot','video','feedback','success_case','social_account') AND target_id IN (SELECT id FROM screenshot WHERE ip_id = ?) OR target_id IN (SELECT id FROM video WHERE ip_id = ?) OR target_id IN (SELECT id FROM feedbacks WHERE ip_id = ?) OR target_id IN (SELECT id FROM success_cases WHERE ip_id = ?) OR target_id IN (SELECT id FROM social_account WHERE ip_id = ?) ORDER BY created_at DESC LIMIT 100"
    ).all(ipId, ipId, ipId, ipId, ipId, ipId);
    return jsonResponse(items);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
