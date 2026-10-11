import { jsonResponse } from '@/lib/api-helpers';
import { clearUserTokens } from '@/lib/feishu';

export async function POST() {
  clearUserTokens();
  return jsonResponse({ success: true });
}
