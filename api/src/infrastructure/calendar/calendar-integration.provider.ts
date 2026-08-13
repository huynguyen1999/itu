import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import ICAL from 'ical.js';
import { CONFIG_KEYS, DEFAULT_URLS, GOOGLE_OAUTH } from '@core/application/constants/app.constants';
import type {
  CalendarConnectionRecord,
  CalendarEventChange,
  CalendarGoogleSync,
  CalendarIntegrationPort,
  CalendarSourceRecord,
  ParsedCalendarEvent,
} from '@core/application/ports/out/calendar.port';
import { createUlid } from '../persistence/prisma/ulid';
import { fetchWithTimeout } from '../http/outbound-http';
import { fetchCalendarText, validateCalendarUrl } from './ssrf-safe-fetch';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const RANGE_BEFORE_MONTHS = 3;
const RANGE_AFTER_MONTHS = 12;
const MAX_ICAL_EVENTS = 10_000;

type GoogleToken = { access_token: string; refresh_token?: string; expires_in: number };
type GoogleCalendar = { id?: string; summary?: string; summaryOverride?: string; backgroundColor?: string; deleted?: boolean };
type GoogleEvent = {
  id: string;
  recurrenceId?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  etag?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};
type GoogleEventsPage = { items: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };

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

function textValue(value: unknown): string | null { return typeof value === 'string' && value ? value : null; }
function parameterText(value: unknown): string | null { return textValue(Array.isArray(value) ? value[0] : value); }

@Injectable()
export class CalendarIntegrationProvider implements CalendarIntegrationPort {
  constructor(private readonly config: ConfigService) {}

  normalizeIcsUrl(url: string): string { return validateCalendarUrl(url).toString(); }

  async fetchIcs(url: string, from: Date, to: Date) {
    const downloaded = await fetchCalendarText(url);
    return { events: parseIcsEvents(downloaded.text, from, to), etag: downloaded.etag, lastModified: downloaded.lastModified };
  }

  googleConnectUrl(userId: string): string {
    const url = new URL(GOOGLE_OAUTH.authorizationUrl);
    url.searchParams.set('client_id', this.googleClientId());
    url.searchParams.set('redirect_uri', this.googleCallbackUrl());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', `${GOOGLE_SCOPE} openid email`);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', this.signState(userId));
    return url.toString();
  }

  async googleCallback(code: string, state: string) {
    const userId = this.verifyState(state);
    const token = await this.exchangeGoogleCode(code);
    const profile = await this.googleJson<{ email?: string; sub?: string }>(GOOGLE_OAUTH.userInfoUrl, token.access_token);
    const accountEmail = profile.email?.trim() || profile.sub || null;
    if (!accountEmail) throw new BadRequestException('Google account did not include an identifier');
    return {
      userId,
      accountEmail,
      encryptedRefreshToken: token.refresh_token ? encrypt(token.refresh_token, this.secret()) : null,
    };
  }

  async syncGoogleConnection(connection: CalendarConnectionRecord, sources: CalendarSourceRecord[]): Promise<CalendarGoogleSync> {
    if (!connection.encryptedRefreshToken) throw new BadRequestException('Google Calendar is not connected');
    const token = await this.exchangeRefreshToken(decrypt(connection.encryptedRefreshToken, this.secret()));
    const calendars = await this.googleJson<{ items?: GoogleCalendar[] }>(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
      token.access_token,
    );
    const result: CalendarGoogleSync['calendars'] = [];
    for (const remote of calendars.items ?? []) {
      if (!remote.id || remote.deleted) continue;
      const existing = sources.find((source) => source.providerCalendarId === remote.id);
      const synced = await this.syncGoogleCalendar(remote.id, token.access_token, existing?.syncToken ?? null);
      result.push({
        providerCalendarId: remote.id,
        name: remote.summaryOverride || remote.summary || remote.id,
        color: remote.backgroundColor,
        events: synced.events,
        syncToken: synced.syncToken,
        nextSyncToken: synced.nextSyncToken,
        watch: await this.ensureGoogleWatch(existing, remote.id, token.access_token),
      });
    }
    return {
      accessTokenExpiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000),
      calendars: result,
    };
  }

  private async syncGoogleCalendar(providerCalendarId: string, accessToken: string, syncToken: string | null) {
    try {
      const result = await this.collectGoogleEvents(providerCalendarId, accessToken, syncToken);
      return { ...result, syncToken };
    } catch (error) {
      if (!(error instanceof GoogleSyncReset) || syncToken === null) throw error;
      const result = await this.collectGoogleEvents(providerCalendarId, accessToken, null);
      return { ...result, syncToken: null };
    }
  }

  private async collectGoogleEvents(providerCalendarId: string, accessToken: string, syncToken: string | null) {
    const from = new Date();
    from.setMonth(from.getMonth() - RANGE_BEFORE_MONTHS);
    const to = new Date();
    to.setMonth(to.getMonth() + RANGE_AFTER_MONTHS);
    const page = await this.googleEvents(providerCalendarId, accessToken, syncToken, from, to);
    const events = page.items.map(normalizeGoogleEvent).filter((event): event is CalendarEventChange => event !== null);
    let nextPageToken = page.nextPageToken;
    let nextSyncToken = page.nextSyncToken ?? null;
    while (nextPageToken) {
      const next = await this.googleEvents(providerCalendarId, accessToken, syncToken, from, to, nextPageToken);
      events.push(...next.items.map(normalizeGoogleEvent).filter((event): event is CalendarEventChange => event !== null));
      nextPageToken = next.nextPageToken;
      nextSyncToken = next.nextSyncToken ?? nextSyncToken;
    }
    return { events, nextSyncToken };
  }

  private async ensureGoogleWatch(calendar: CalendarSourceRecord | undefined, providerCalendarId: string, accessToken: string) {
    const origin = this.config.get<string>(CONFIG_KEYS.apiOrigin, DEFAULT_URLS.apiOrigin);
    if (!origin.startsWith('https://') || (calendar?.channelExpiration && calendar.channelExpiration.getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000)) return null;
    try {
      const response = await fetchWithTimeout(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(providerCalendarId)}/events/watch`, {
        method: 'POST',
        headers: { accept: 'application/json', authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: createUlid(), type: 'web_hook', address: `${origin}/calendar/google/webhook` }),
      });
      if (!response.ok) return null;
      const watch = await response.json() as { id?: string; resourceId?: string; expiration?: string };
      if (!watch.id || !watch.resourceId) return null;
      return { channelId: watch.id, resourceId: watch.resourceId, channelExpiration: watch.expiration ? new Date(Number(watch.expiration)) : null };
    } catch {
      return null;
    }
  }

  private googleEvents(calendarId: string, accessToken: string, syncToken: string | null, from: Date, to: Date, pageToken?: string) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('orderBy', 'startTime');
    if (syncToken) url.searchParams.set('syncToken', syncToken);
    else { url.searchParams.set('timeMin', from.toISOString()); url.searchParams.set('timeMax', to.toISOString()); }
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    return this.googleJson<GoogleEventsPage>(url.toString(), accessToken);
  }

  private async exchangeGoogleCode(code: string): Promise<GoogleToken> {
    const response = await fetchWithTimeout(GOOGLE_OAUTH.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: this.googleClientId(), client_secret: this.googleClientSecret(), redirect_uri: this.googleCallbackUrl(), grant_type: 'authorization_code' }),
    });
    if (!response.ok) throw new BadRequestException('Google Calendar authorization failed');
    const token = await response.json() as GoogleToken;
    if (!token.access_token) throw new BadRequestException('Google Calendar authorization failed');
    return token;
  }

  private async exchangeRefreshToken(refreshToken: string): Promise<GoogleToken> {
    const response = await fetchWithTimeout(GOOGLE_OAUTH.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: this.googleClientId(), client_secret: this.googleClientSecret(), grant_type: 'refresh_token' }),
    });
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

  private googleCallbackUrl() { return `${this.config.get<string>(CONFIG_KEYS.apiOrigin, DEFAULT_URLS.apiOrigin)}/calendar/google/callback`; }
  private secret() { return this.config.getOrThrow<string>(CONFIG_KEYS.jwtRefreshSecret); }
}

class GoogleSyncReset extends Error {}

function normalizeGoogleEvent(event: GoogleEvent): CalendarEventChange | null {
  const recurrenceId = event.recurrenceId ?? null;
  const etag = event.etag ?? null;
  if (event.status?.toLowerCase() === 'cancelled') {
    return { externalId: event.id, recurrenceId, deleted: true, event: null, etag };
  }

  const start = googleDate(event.start);
  if (!start) return null;
  const end = googleDate(event.end);
  return {
    externalId: event.id,
    recurrenceId,
    deleted: false,
    etag,
    event: {
      externalId: event.id,
      recurrenceId,
      title: event.summary || 'Untitled event',
      description: event.description ?? null,
      location: event.location ?? null,
      startAt: start.date,
      endAt: end?.date ?? null,
      allDay: start.allDay,
      timeZone: start.timeZone ?? null,
      status: event.status?.toUpperCase() || 'CONFIRMED',
    },
  };
}

function googleDate(value?: GoogleEvent['start']) {
  if (!value) return null;
  if (value.dateTime) {
    const date = new Date(value.dateTime);
    return Number.isNaN(date.getTime()) ? null : { date, allDay: false, timeZone: value.timeZone };
  }
  if (value.date) {
    const date = new Date(`${value.date}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : { date, allDay: true, timeZone: value.timeZone };
  }
  return null;
}

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
