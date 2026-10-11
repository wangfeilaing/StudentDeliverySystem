import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';

// GET /api/ips/[id]/delivery-logs
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = getDb();
    const { id: idStr } = await params;
    const clientId = parseInt(idStr, 10);
    if (isNaN(clientId)) return errorResponse('无效 ID', 400);

    const logs = db.prepare(
      "SELECT * FROM delivery_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 200"
    ).all(clientId);
    return jsonResponse(logs);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
