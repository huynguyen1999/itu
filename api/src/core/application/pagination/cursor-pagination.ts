import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export interface DecodedCursor {
  id: string;
  createdAt: Date;
}

export interface NormalizedCursorPageOptions {
  limit: number;
  cursor?: DecodedCursor;
  q?: string;
}

export function normalizeCursorOptions(options: CursorPageOptions = {}): NormalizedCursorPageOptions {
  const limit = clampLimit(options.limit);
  const q = options.q?.trim() || undefined;
  return {
    limit,
    q,
    cursor: options.cursor ? decodeCursor(options.cursor) : undefined,
  };
}

export function toCursorPage<T extends { id: string }>(
  items: T[],
  limit: number,
  dateSelector: (item: T) => Date | string | null | undefined,
): CursorPage<T> {
  const hasNextPage = items.length > limit;
  const data = hasNextPage ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  return {
    data,
    meta: {
      hasNextPage,
      nextCursor: hasNextPage && last ? encodeCursor(last.id, dateSelector(last)) : null,
    },
  };
}

function clampLimit(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(value ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
}

function encodeCursor(id: string, date: Date | string | null | undefined): string {
  const createdAt = date instanceof Date ? date.toISOString() : date;
  return Buffer.from(JSON.stringify({ id, createdAt })).toString('base64url');
}

function decodeCursor(cursor: string): DecodedCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      id?: unknown;
      createdAt?: unknown;
    };
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') return undefined;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return undefined;
    return { id: parsed.id, createdAt };
  } catch {
    return undefined;
  }
}
