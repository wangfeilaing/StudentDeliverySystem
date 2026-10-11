import { NextResponse } from 'next/server';

export function jsonResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function parseId(params: { id: string }): number {
  const id = parseInt(params.id, 10);
  if (isNaN(id) || id <= 0) {
    throw new Error('Invalid ID');
  }
  return id;
}

export function softDeleteFilter(table: string): string {
  const softDeleteTables = ['ip', 'screenshot', 'video'];
  return softDeleteTables.includes(table) ? `${table}.deleted_at IS NULL` : '1=1';
}

export function parsePagination(request: Request): { page: number; limit: number; offset: number } {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
