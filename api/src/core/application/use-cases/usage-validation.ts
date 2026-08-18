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

export function localHourFor(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
  return parseInt(hourPart, 10);
}

export interface HourlyUsageSlice {
  localDate: Date;
  hour: number;
  seconds: number;
}

export function splitIntervalIntoHours(
  startedAt: Date,
  endedAt: Date,
  durationSeconds: number,
  timezone = 'Asia/Ho_Chi_Minh',
): HourlyUsageSlice[] {
  if (durationSeconds <= 0 || startedAt >= endedAt) return [];
  const spanMs = Math.max(1000, endedAt.getTime() - startedAt.getTime());
  const slices: HourlyUsageSlice[] = [];

  let cursor = new Date(startedAt.getTime());
  let allocatedSeconds = 0;

  while (cursor < endedAt) {
    const nextHourMs = (Math.floor(cursor.getTime() / 3_600_000) + 1) * 3_600_000;
    const nextHour = new Date(nextHourMs);
    const segmentEnd = endedAt < nextHour ? endedAt : nextHour;
    const segmentMs = segmentEnd.getTime() - cursor.getTime();

    const localDateStr = localDateFor(cursor, timezone);
    const localDate = new Date(`${localDateStr}T00:00:00.000Z`);
    const hour = localHourFor(cursor, timezone);
    const sliceSeconds = Math.max(0, Math.round((segmentMs / spanMs) * durationSeconds));

    if (sliceSeconds > 0) {
      slices.push({ localDate, hour, seconds: sliceSeconds });
      allocatedSeconds += sliceSeconds;
    }
    cursor = segmentEnd;
  }

  const diff = durationSeconds - allocatedSeconds;
  if (diff !== 0 && slices.length > 0) {
    slices[slices.length - 1].seconds = Math.max(0, slices[slices.length - 1].seconds + diff);
  }

  return slices.filter((s) => s.seconds > 0);
}

const SYSTEM_EXCLUDED_BUNDLE_SET = new Set([
  'loginwindow',
  'com.apple.loginwindow',
  'com.apple.loginwindow.xpc',
  'com.apple.lockscreen',
  'com.apple.LockScreen',
  'lockscreen',
  'control-center',
  'com.apple.control-center',
  'com.apple.controlcenter',
  'com.apple.ControlCenter',
  'dock',
  'com.apple.dock',
  'com.apple.WindowManager',
  'com.apple.notificationcenterui',
  'com.apple.usernotifications.service',
  'com.apple.Spotlight',
  'com.apple.ScreenSaver.Engine',
  'com.apple.screensaver',
  'com.apple.systemuiserver',
  'com.apple.SystemUIServer',
  'com.apple.screencapture',
  'com.apple.screencaptureui',
  'com.apple.AirPlayUIAgent',
  'com.apple.quicklook.ui.helper',
  'com.apple.CoreAuthUI',
  'com.apple.SecurityAgent',
  'com.apple.universalaccessd',
  'com.apple.PowerChime',
  'com.apple.UserNotificationCenter',
  'com.apple.TextInputMenuAgent',
  'com.apple.TextInputSwitcher',
  'com.apple.talagent',
  'com.apple.coreservices.uiagent',
  'com.apple.systempreferences.quicklook',
  'com.apple.SoftwareUpdateNotificationManager',
  'com.apple.ClockAngel',
  'com.apple.PosterBoard',
  'com.apple.PassbookUIService',
  'com.apple.AuthKitUIService',
  'com.apple.AuthenticationServicesUI',
  'com.apple.CTNotifyUIService',
  'com.apple.LocalAuthentication.UIAgent',
  'com.apple.LocalAuthenticationUIService',
  'com.apple.ScreenshotServicesService',
  'com.apple.ProblemReporter',
  'com.apple.springboard.home-screen-open-folder',
  'com.apple.springboard.today-view',
  'com.apple.springboard.widget-editing',
]);

export function isSystemExcludedBundleId(bundleId: string | null | undefined): boolean {
  if (!bundleId) return true;
  const trimmed = bundleId.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (SYSTEM_EXCLUDED_BUNDLE_SET.has(trimmed) || SYSTEM_EXCLUDED_BUNDLE_SET.has(lower)) return true;
  if (
    lower.includes('loginwindow') ||
    lower.includes('lockscreen') ||
    lower.includes('screensaver') ||
    lower.includes('controlcenter') ||
    lower.includes('control-center') ||
    lower.includes('clockangel') ||
    lower.includes('posterboard') ||
    lower.includes('passbookuiservice') ||
    lower.includes('authkituiservice') ||
    lower.includes('authenticationservicesui') ||
    lower.includes('ctnotifyuiservice') ||
    lower.includes('localauthentication') ||
    lower.includes('screenshotservices') ||
    lower.includes('problemreporter') ||
    lower.includes('springboard') ||
    lower.startsWith('com.apple.controlcenter') ||
    lower.startsWith('com.apple.control-center') ||
    lower.startsWith('com.apple.windowmanager') ||
    lower.startsWith('com.apple.systemuiserver') ||
    lower.startsWith('com.apple.dock') ||
    lower.startsWith('com.apple.notificationcenter') ||
    lower.startsWith('com.apple.usernotificationcenter') ||
    lower.startsWith('com.apple.springboard')
  ) {
    return true;
  }
  return false;
}

