import { getDb } from '@/lib/db';
import { jsonResponse, errorResponse } from '@/lib/api-helpers';
import { requireAuth } from '@/lib/session';
import * as XLSX from 'xlsx';

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = false; }
        } else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter(r => r.length >= headers.length || r.some(c => c));
  return { headers, rows };
}

function parseXLSX(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  if (data.length < 2) return { headers: [], rows: [] };
  const headers = data[0].map(h => String(h).trim());
  const rows = data.slice(1).map(row =>
    headers.map((_, i) => (row[i] != null ? String(row[i]).trim() : ''))
  ).filter(r => r.some(c => c));
  return { headers, rows };
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

function findColumn(headers: string[], keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => h.includes(k)));
}

// POST /api/wechat-orders/import-csv — import CSV/XLSX to fill buyer names
export async function POST(request: Request) {
  try {
    await requireAuth(['super_admin', 'admin', 'operator', 'business']);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorResponse('请上传文件', 400);

    const fileName = file.name.toLowerCase();
    let headers: string[];
    let rows: string[][];

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const result = parseXLSX(buffer);
      headers = result.headers;
      rows = result.rows;
    } else {
      const text = await file.text();
      const result = parseCSV(text);
      headers = result.headers;
      rows = result.rows;
    }

    if (rows.length === 0) return errorResponse('文件中没有数据或格式不正确', 400);

    // Find relevant columns
    const phoneIdx = findColumn(headers, ['联系电话', '手机', '电话', 'tel', 'phone', '虚拟联系电话']);
    const nicknameIdx = findColumn(headers, ['微信昵称', '昵称', '买家昵称', 'nickname']);
    const nameIdx = findColumn(headers, ['收件人', '姓名', '联系人', 'user_name', '收货人']);

    if (phoneIdx === -1) {
      return errorResponse('未找到联系电话列，请确认是微信小店导出的订单报表', 400);
    }
    if (nicknameIdx === -1 && nameIdx === -1) {
      return errorResponse('未找到昵称或收件人列，请确认是微信小店导出的订单报表', 400);
    }

    const db = getDb();
    const updateByName = db.prepare('UPDATE wechat_orders SET buyer_name = ? WHERE buyer_phone = ? AND buyer_name = ?');
    const updateRemark = db.prepare('UPDATE wechat_orders SET remark = ? WHERE buyer_phone = ? AND remark = ?');

    let matched = 0;
    let skipped = 0;
    const unmatchedPhones: string[] = [];

    for (const row of rows) {
      const rawPhone = phoneIdx >= 0 && phoneIdx < row.length ? row[phoneIdx] : '';
      const phone = normalizePhone(rawPhone);
      if (!phone || phone.length < 7) { skipped++; continue; }

      const nickname = nicknameIdx >= 0 && nicknameIdx < row.length ? row[nicknameIdx] : '';
      const recipientName = nameIdx >= 0 && nameIdx < row.length ? row[nameIdx] : '';

      // Prefer recipient name, fall back to nickname
      const buyerName = (recipientName || nickname).trim();
      if (!buyerName) { skipped++; continue; }

      // Try to match by phone and update buyer_name
      const result = updateByName.run(buyerName, phone, '');
      if (result.changes > 0) {
        matched++;
        continue;
      }

      // If name already exists with same phone, update remark with nickname
      if (nickname.trim()) {
        const remarkResult = updateRemark.run(nickname.trim(), phone, '');
        if (remarkResult.changes > 0) matched++;
        else unmatchedPhones.push(phone);
      } else {
        unmatchedPhones.push(phone);
      }
    }

    return jsonResponse({
      message: `导入完成：成功匹配 ${matched} 单，跳过 ${skipped} 单${unmatchedPhones.length > 0 ? `，${unmatchedPhones.length} 单未匹配` : ''}`,
      matched,
      skipped,
      unmatched: unmatchedPhones.length,
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') return errorResponse('未登录', 401);
    return errorResponse((e as Error).message);
  }
}
