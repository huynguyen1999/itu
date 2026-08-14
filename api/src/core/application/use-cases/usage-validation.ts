import { BadRequestException } from '@nestjs/common';
import { USAGE_CONSTANTS } from '@core/application/constants/app.constants';

export function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} is not a valid date`);
  }
  return date;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function localDateFor(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nextDay(date: Date): Date {
  return new Date(date.getTime() + 86_400_000);
}

export function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeHostname(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 253) {
    throw new BadRequestException('hostname must be a valid hostname');
  }
  const hostname = value.toLowerCase();
  if (!USAGE_CONSTANTS.hostnamePattern.test(hostname)) {
    throw new BadRequestException('hostname must contain only a normalized hostname');
  }
  return hostname;
}

export function validateWebsiteRange(start: Date, end: Date): void {
  if (start > end) throw new BadRequestException('from must not be after to');
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  if (days > USAGE_CONSTANTS.maxDateRangeDays) throw new BadRequestException('Usage date range cannot exceed 365 days');
}

export function normalizeWebsiteUrl(value: unknown, hostname: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new BadRequestException('url must be a valid HTTP(S) URL at most 2048 characters');
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || normalizeHostname(url.hostname) !== hostname) {
      throw new Error('invalid URL');
    }
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    throw new BadRequestException('url must be a valid HTTP(S) URL matching hostname');
  }
}

export function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }
  return new Date(value);
}

export function normalizeActivityUrl(value: unknown, hostname: string): string {
  if (value === undefined || value === null) throw new Error('url is required');
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Error('url must be a valid HTTP(S) URL at most 2048 characters');
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || normalizeHostname(url.hostname) !== hostname) {
      throw new Error('invalid URL');
    }
    url.hash = '';
    url.search = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    throw new Error('url must be a valid HTTP(S) URL matching hostname');
  }
}

export function normalizeActivityIconUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    const normalized = url.toString();
    return normalized.length <= 2048 ? normalized : null;
  } catch {
    return null;
  }
}

export function sanitizePageTitle(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 512) throw new Error('pageTitle must be at most 512 characters');
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || null;
}

export function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new BadRequestException(`${field} is required and must be at most 255 characters`);
  }
  return value;
}

export function requireTimezone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100 || !validTimezone(value)) {
    throw new BadRequestException('timezone must be a valid IANA timezone');
  }
  return value;
}
