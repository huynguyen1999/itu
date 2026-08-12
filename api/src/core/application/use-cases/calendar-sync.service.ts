import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarProvider } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import ICAL from 'ical.js';
import { CONFIG_KEYS, DEFAULT_URLS, GOOGLE_OAUTH } from '@core/application/constants/app.constants';
import { createUlid } from '@infrastructure/persistence/prisma/ulid';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { fetchWithTimeout } from '@infrastructure/http/outbound-http';
import { fetchCalendarText, validateCalendarUrl } from '@infrastructure/calendar/ssrf-safe-fetch';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const RANGE_BEFORE_MONTHS = 3;
const RANGE_AFTER_MONTHS = 12;
const MAX_ICAL_EVENTS = 10_000;

export type ParsedCalendarEvent = {
  externalId: string;
  recurrenceId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  timeZone: string | null;
  status: string;
};

export function parseIcsEvents(text: string, from: Date, to: Date): ParsedCalendarEvent[] {
  const calendar = ICAL.Component.fromString(text);
  const result: ParsedCalendarEvent[] = [];
  for (const component of calendar.getAllSubcomponents('vevent')) {
    if (component.hasProperty('recurrence-id')) continue;
    const event = new ICAL.Event(component);
    if (String(event.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let occurrence: ICAL.Time | null;
      while ((occurrence = iterator.next())) {
        if (result.length >= MAX_ICAL_EVENTS) break;
        const details = event.getOccurrenceDetails(occurrence);
        const startAt = details.startDate.toJSDate();
        const endAt = details.endDate?.toJSDate() ?? null;
        if (startAt >= to) break;
        if (endAt && endAt <= from) continue;
        result.push(toParsedEvent(event, startAt, endAt, occurrence.toString(), details.item));
      }
      continue;
    }
    const startAt = event.startDate.toJSDate();
    const endAt = event.endDate?.toJSDate() ?? null;
    if (startAt < to && (!endAt || endAt > from)) result.push(toParsedEvent(event, startAt, endAt, null, event));
  }
  return result.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

function toParsedEvent(event: ICAL.Event, startAt: Date, endAt: Date | null, recurrenceId: string | null, item: ICAL.Event): ParsedCalendarEvent {
  const startProperty = item.component.getFirstProperty('dtstart') ?? event.component.getFirstProperty('dtstart');
  const startValue = startProperty?.getFirstValue();
  return {
    externalId: event.uid,
    recurrenceId,
    title: String(item.summary || event.summary || 'Untitled event'),
    description: textValue(item.description) ?? textValue(event.description),
    location: textValue(item.location) ?? textValue(event.location),
    startAt,
    endAt,
    allDay: startValue instanceof ICAL.Time && startValue.isDate,
    timeZone: parameterText(startProperty?.getParameter('tzid')),
    status: String(item.component.getFirstPropertyValue('status') ?? event.component.getFirstPropertyValue('status') ?? 'CONFIRMED').toUpperCase(),
  };
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function parameterText(value: unknown): string | null {
  return textValue(Array.isArray(value) ? value[0] : value);
}

@Injectable()
export class CalendarSyncService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.syncAllGoogle(), 20 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  list(userId: string) {
    return this.prisma.externalCalendar.findMany({
      where: { userId },
      orderBy: [{ visible: 'desc' }, { name: 'asc' }],
      select: {
        id: true, provider: true, name: true, url: true, color: true, visible: true,
        lastSuccessfulSyncAt: true, lastError: true,
      },
    });
  }

  async createIcs(userId: string, url: string, name?: string) {
    const safeUrl = validateCalendarUrl(url).toString();
    const calendar = await this.prisma.externalCalendar.create({
      data: { id: createUlid(), userId, provider: CalendarProvider.ICS, url: safeUrl, name: name?.trim() || new URL(safeUrl).hostname },
    });
    try {
      return await this.syncIcs(userId, calendar.id);
    } catch (error) {
      await this.prisma.externalCalendar.update({ where: { id: calendar.id }, data: { lastError: safeError(error) } });
      throw error;
    }
  }

  async syncIcs(userId: string, calendarId: string) {
    const calendar = await this.prisma.externalCalendar.findFirst({ where: { id: calendarId, userId, provider: CalendarProvider.ICS } });
    if (!calendar?.url) throw new BadRequestException('ICS calendar was not found');
    try {
      const downloaded = await fetchCalendarText(calendar.url);
      const from = new Date();
      from.setMonth(from.getMonth() - RANGE_BEFORE_MONTHS);
      const to = new Date();
      to.setMonth(to.getMonth() + RANGE_AFTER_MONTHS);
      const events = parseIcsEvents(downloaded.text, from, to);
      await this.prisma.$transaction(async (tx) => {
        await tx.externalCalendarEvent.deleteMany({ where: { calendarId } });
        if (events.length) {
          await tx.externalCalendarEvent.createMany({
            data: events.map((event) => ({ id: createUlid(), userId, calendarId, ...event, readOnly: true })),
          });
        }
        await tx.externalCalendar.update({
          where: { id: calendarId },
          data: { etag: downloaded.etag, lastModified: downloaded.lastModified, lastFetchedAt: new Date(), lastSuccessfulSyncAt: new Date(), lastError: null },
        });
      });
      return this.prisma.externalCalendar.findUnique({ where: { id: calendarId } });
    } catch (error) {
      await this.prisma.externalCalendar.update({ where: { id: calendarId }, data: { lastFetchedAt: new Date(), lastError: safeError(error) } }).catch(() => undefined);
      throw error;
    }
  }

  async update(userId: string, id: string, data: { visible?: boolean; color?: string }) {
    return this.prisma.externalCalendar.updateMany({ where: { id, userId }, data });
  }

  async refresh(userId: string, id: string) {
    const calendar = await this.prisma.externalCalendar.findFirst({ where: { id, userId } });
    if (!calendar) throw new BadRequestException('Calendar source was not found');
    if (calendar.provider === CalendarProvider.ICS) return this.syncIcs(userId, id);
    if (!calendar.connectionId) throw new BadRequestException('Google Calendar connection was not found');
    return this.syncGoogleConnection(calendar.connectionId, userId);
  }

  async remove(userId: string, id: string) {
    await this.prisma.externalCalendar.deleteMany({ where: { id, userId } });
  }

  googleConnectUrl(userId: string): string {
    const callback = this.googleCallbackUrl();
    const state = this.signState(userId);
    const url = new URL(GOOGLE_OAUTH.authorizationUrl);
    url.searchParams.set('client_id', this.googleClientId());
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', `${GOOGLE_SCOPE} openid email`);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async googleCallback(code: string, state: string) {
    const userId = this.verifyState(state);
    const token = await this.exchangeGoogleCode(code);
    const profile = await this.googleJson<{ email?: string; sub?: string }>(GOOGLE_OAUTH.userInfoUrl, token.access_token);
    const accountEmail = profile.email?.trim() || profile.sub || null;
    if (!accountEmail) throw new BadRequestException('Google account did not include an identifier');
    const existing = await this.prisma.calendarConnection.findFirst({ where: { userId, provider: CalendarProvider.GOOGLE, accountEmail } });
    const connection = existing
      ? await this.prisma.calendarConnection.update({ where: { id: existing.id }, data: { encryptedRefreshToken: token.refresh_token ? encrypt(token.refresh_token, this.secret()) : existing.encryptedRefreshToken, status: 'CONNECTED', lastError: null } })
      : await this.prisma.calendarConnection.create({ data: { id: createUlid(), userId, provider: CalendarProvider.GOOGLE, accountEmail, encryptedRefreshToken: token.refresh_token ? encrypt(token.refresh_token, this.secret()) : null } });
    await this.syncGoogleConnection(connection.id);
    return { userId };
  }

  async syncGoogleConnection(connectionId: string, userId?: string) {
    const connection = await this.prisma.calendarConnection.findFirst({ where: { id: connectionId, ...(userId ? { userId } : {}), provider: CalendarProvider.GOOGLE } });
    if (!connection?.encryptedRefreshToken) throw new BadRequestException('Google Calendar is not connected');
    try {
      const token = await this.exchangeRefreshToken(decrypt(connection.encryptedRefreshToken, this.secret()));
      await this.prisma.calendarConnection.update({ where: { id: connection.id }, data: { accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000), status: 'CONNECTED', lastError: null } });
      const calendars = await this.googleJson<{ items?: GoogleCalendar[] }>('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', token.access_token);
      for (const source of calendars.items ?? []) {
        if (!source.id || source.deleted) continue;
        const calendar = await this.prisma.externalCalendar.findFirst({ where: { connectionId: connection.id, provider: CalendarProvider.GOOGLE, providerCalendarId: source.id } });
        const saved = calendar
          ? await this.prisma.externalCalendar.update({ where: { id: calendar.id }, data: { name: source.summaryOverride || source.summary || source.id, color: source.backgroundColor || calendar.color } })
          : await this.prisma.externalCalendar.create({ data: { id: createUlid(), userId: connection.userId, connectionId: connection.id, provider: CalendarProvider.GOOGLE, providerCalendarId: source.id, name: source.summaryOverride || source.summary || source.id, color: source.backgroundColor || 'BLUE' } });
        await this.syncGoogleCalendar(saved.id, source.id, token.access_token);
      }
      return this.list(connection.userId);
    } catch (error) {
      await this.prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'ERROR', lastError: safeError(error) } }).catch(() => undefined);
      throw error;
    }
  }

  async syncAllGoogle() {
    const connections = await this.prisma.calendarConnection.findMany({ where: { provider: CalendarProvider.GOOGLE, status: { not: 'DISCONNECTED' } }, select: { id: true } });
    await Promise.allSettled(connections.map(({ id }) => this.syncGoogleConnection(id)));
  }

  async handleGoogleWebhook(channelId?: string) {
    if (!channelId) return;
    const calendar = await this.prisma.externalCalendar.findFirst({ where: { channelId }, select: { connectionId: true } });
    if (calendar?.connectionId) void this.syncGoogleConnection(calendar.connectionId).catch(() => undefined);
  }

  private async syncGoogleCalendar(calendarId: string, providerCalendarId: string, accessToken: string): Promise<void> {
    const calendar = await this.prisma.externalCalendar.findUnique({ where: { id: calendarId } });
    if (!calendar) return;
    const from = new Date(); from.setMonth(from.getMonth() - RANGE_BEFORE_MONTHS);
    const to = new Date(); to.setMonth(to.getMonth() + RANGE_AFTER_MONTHS);
    try {
      const page = await this.googleEvents(providerCalendarId, accessToken, calendar.syncToken, from, to);
      const allEvents = [...page.items];
      let nextPageToken = page.nextPageToken;
      let nextSyncToken = page.nextSyncToken;
      while (nextPageToken) {
        const next = await this.googleEvents(providerCalendarId, accessToken, calendar.syncToken, from, to, nextPageToken);
        allEvents.push(...next.items);
        nextPageToken = next.nextPageToken;
        nextSyncToken = next.nextSyncToken ?? nextSyncToken;
      }
      await this.prisma.$transaction(async (tx) => {
        if (!calendar.syncToken) await tx.externalCalendarEvent.deleteMany({ where: { calendarId } });
        for (const event of allEvents) {
          const recurrenceId = event.recurrenceId ?? null;
          if (event.status === 'cancelled') {
            await tx.externalCalendarEvent.deleteMany({ where: { calendarId, externalId: event.id, ...(recurrenceId ? { recurrenceId } : {}) } });
            continue;
          }
          const start = googleDate(event.start);
          if (!start) continue;
          const end = googleDate(event.end);
          const existing = await tx.externalCalendarEvent.findFirst({ where: { calendarId, externalId: event.id, recurrenceId } });
          const data = { title: event.summary || 'Untitled event', description: event.description ?? null, location: event.location ?? null, startAt: start.date, endAt: end?.date ?? null, allDay: start.allDay, timeZone: start.timeZone ?? null, status: event.status || 'CONFIRMED', etag: event.etag ?? null, readOnly: true };
          if (existing) await tx.externalCalendarEvent.update({ where: { id: existing.id }, data });
          else await tx.externalCalendarEvent.create({ data: { id: createUlid(), userId: calendar.userId, calendarId, externalId: event.id, recurrenceId, ...data } });
        }
        await tx.externalCalendar.update({ where: { id: calendarId }, data: { syncToken: nextSyncToken ?? calendar.syncToken, lastFetchedAt: new Date(), lastSuccessfulSyncAt: new Date(), lastError: null } });
      });
      await this.ensureGoogleWatch(calendarId, providerCalendarId, accessToken);
    } catch (error) {
      if (isGoogleSyncReset(error)) {
        await this.prisma.externalCalendar.update({ where: { id: calendarId }, data: { syncToken: null } });
        return this.syncGoogleCalendar(calendarId, providerCalendarId, accessToken);
      }
      await this.prisma.externalCalendar.update({ where: { id: calendarId }, data: { lastFetchedAt: new Date(), lastError: safeError(error) } }).catch(() => undefined);
      throw error;
    }
  }

  private async googleEvents(calendarId: string, accessToken: string, syncToken: string | null, from: Date, to: Date, pageToken?: string) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('orderBy', 'startTime');
    if (syncToken) url.searchParams.set('syncToken', syncToken);
    else { url.searchParams.set('timeMin', from.toISOString()); url.searchParams.set('timeMax', to.toISOString()); }
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    return this.googleJson<GoogleEventsResponse>(url.toString(), accessToken);
  }

  private async ensureGoogleWatch(calendarId: string, providerCalendarId: string, accessToken: string): Promise<void> {
    const origin = this.config.get<string>(CONFIG_KEYS.apiOrigin, DEFAULT_URLS.apiOrigin);
    if (!origin.startsWith('https://')) return;
    const calendar = await this.prisma.externalCalendar.findUnique({ where: { id: calendarId } });
    if (calendar?.channelExpiration && calendar.channelExpiration.getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000) return;
    try {
      const response = await fetchWithTimeout(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(providerCalendarId)}/events/watch`, {
        method: 'POST',
        headers: { accept: 'application/json', authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: createUlid(), type: 'web_hook', address: `${origin}/calendar/google/webhook` }),
      });
      if (!response.ok) return;
      const watch = await response.json() as { id?: string; resourceId?: string; expiration?: string };
      if (watch.id && watch.resourceId) await this.prisma.externalCalendar.update({ where: { id: calendarId }, data: { channelId: watch.id, resourceId: watch.resourceId, channelExpiration: watch.expiration ? new Date(Number(watch.expiration)) : null } });
    } catch {
      // A sync remains useful when a deployment has no public webhook endpoint.
    }
  }

  private async exchangeGoogleCode(code: string): Promise<GoogleToken> {
    const response = await fetchWithTimeout(GOOGLE_OAUTH.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: this.googleClientId(), client_secret: this.googleClientSecret(), redirect_uri: this.googleCallbackUrl(), grant_type: 'authorization_code' }) });
    if (!response.ok) throw new BadRequestException('Google Calendar authorization failed');
    const token = await response.json() as GoogleToken;
    if (!token.access_token) throw new BadRequestException('Google Calendar authorization failed');
    return token;
  }

  private async exchangeRefreshToken(refreshToken: string): Promise<GoogleToken> {
    const response = await fetchWithTimeout(GOOGLE_OAUTH.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: this.googleClientId(), client_secret: this.googleClientSecret(), grant_type: 'refresh_token' }) });
    if (!response.ok) throw new ServiceUnavailableException('Google Calendar token refresh failed');
    const token = await response.json() as GoogleToken;
    if (!token.access_token) throw new ServiceUnavailableException('Google Calendar token refresh failed');
    return { ...token, expires_in: token.expires_in || 3600 };
  }

  private async googleJson<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchWithTimeout(url, { ...init, headers: { accept: 'application/json', authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) } });
    if (response.status === 410) throw new GoogleSyncReset();
    if (!response.ok) throw new ServiceUnavailableException('Google Calendar request failed');
    return response.json() as Promise<T>;
  }

  private signState(userId: string): string {
    const payload = `${userId}.${Date.now()}`;
    const signature = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${Buffer.from(payload).toString('base64url')}.${signature}`;
  }

  private verifyState(state: string): string {
    const [payload, signature] = state.split('.');
    if (!payload || !signature) throw new BadRequestException('Google Calendar state is invalid');
    const decoded = Buffer.from(payload, 'base64url').toString();
    const expected = createHmac('sha256', this.secret()).update(decoded).digest('base64url');
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new BadRequestException('Google Calendar state is invalid');
    const [userId, timestamp] = decoded.split('.');
    if (!userId || !timestamp || Date.now() - Number(timestamp) > 10 * 60 * 1000) throw new BadRequestException('Google Calendar state expired');
    return userId;
  }

  private googleClientId() {
    const value = this.config.get<string>(CONFIG_KEYS.googleClientId)?.trim();
    if (!value) throw new ServiceUnavailableException('Google Calendar is not configured');
    return value;
  }

  private googleClientSecret() {
    const value = this.config.get<string>(CONFIG_KEYS.googleClientSecret)?.trim();
    if (!value) throw new ServiceUnavailableException('Google Calendar is not configured');
    return value;
  }

  private googleCallbackUrl() {
    return `${this.config.get<string>(CONFIG_KEYS.apiOrigin, DEFAULT_URLS.apiOrigin)}/calendar/google/callback`;
  }

  private secret() { return this.config.getOrThrow<string>(CONFIG_KEYS.jwtRefreshSecret); }
}

type GoogleToken = { access_token: string; refresh_token?: string; expires_in: number };
type GoogleCalendar = { id?: string; summary?: string; summaryOverride?: string; backgroundColor?: string; deleted?: boolean };
type GoogleEvent = { id: string; recurrenceId?: string; status?: string; summary?: string; description?: string; location?: string; etag?: string; start?: GoogleDateValue; end?: GoogleDateValue };
type GoogleDateValue = { date?: string; dateTime?: string; timeZone?: string };
type GoogleEventsResponse = { items: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };

function googleDate(value?: GoogleDateValue) {
  if (!value) return null;
  if (value.dateTime) return { date: new Date(value.dateTime), allDay: false, timeZone: value.timeZone };
  if (value.date) return { date: new Date(`${value.date}T00:00:00.000Z`), allDay: true, timeZone: value.timeZone };
  return null;
}

class GoogleSyncReset extends Error {}

function isGoogleSyncReset(error: unknown): boolean { return error instanceof GoogleSyncReset; }

function encrypt(value: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decrypt(value: string, secret: string): string {
  try {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new ServiceUnavailableException('Stored Google Calendar credentials are invalid');
  }
}

function safeError(error: unknown): string {
  if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) return error.message;
  return 'Calendar synchronization failed';
}
