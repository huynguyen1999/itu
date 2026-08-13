export type CalendarProviderName = 'ICS' | 'GOOGLE';

export type CalendarEventRecord = {
  id: string;
  calendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  timeZone?: string | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  calendar: { name: string; color: string };
};

export type CalendarSourceRecord = {
  id: string;
  userId: string;
  provider: CalendarProviderName;
  connectionId: string | null;
  providerCalendarId: string | null;
  name: string;
  url: string | null;
  color: string;
  visible: boolean;
  syncToken: string | null;
  etag: string | null;
  lastModified: string | null;
  lastFetchedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastError: string | null;
  channelId: string | null;
  resourceId: string | null;
  channelExpiration: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CalendarSourceSummary = Pick<
  CalendarSourceRecord,
  'id' | 'provider' | 'name' | 'url' | 'color' | 'visible' | 'lastSuccessfulSyncAt' | 'lastError'
>;

export type CalendarConnectionRecord = {
  id: string;
  userId: string;
  provider: CalendarProviderName;
  accountEmail: string | null;
  encryptedRefreshToken: string | null;
};

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

export type CalendarIcsSnapshot = {
  events: ParsedCalendarEvent[];
  etag?: string;
  lastModified?: string;
};

/** A provider-neutral event mutation ready for persistence. */
export type CalendarEventChange = {
  externalId: string;
  recurrenceId: string | null;
  deleted: boolean;
  event: ParsedCalendarEvent | null;
  etag: string | null;
};

export type CalendarWatch = {
  channelId: string;
  resourceId: string;
  channelExpiration: Date | null;
};

export type CalendarGoogleSync = {
  accessTokenExpiresAt: Date;
  calendars: Array<{
    providerCalendarId: string;
    name: string;
    color?: string;
    events: CalendarEventChange[];
    syncToken: string | null;
    nextSyncToken: string | null;
    watch: CalendarWatch | null;
  }>;
};

export interface CalendarRepositoryPort {
  listVisibleEvents(userId: string, from: Date, to: Date): Promise<CalendarEventRecord[]>;
  listSources(userId: string): Promise<CalendarSourceRecord[]>;
  findSource(userId: string, id: string): Promise<CalendarSourceRecord | null>;
  findSourceById(id: string): Promise<CalendarSourceRecord | null>;
  createSource(data: { userId: string; provider: CalendarProviderName; url?: string; name: string }): Promise<CalendarSourceRecord>;
  updateSource(userId: string, id: string, data: { visible?: boolean; color?: string }): Promise<{ count: number }>;
  deleteSource(userId: string, id: string): Promise<{ count: number }>;
  replaceIcsEvents(calendarId: string, userId: string, events: ParsedCalendarEvent[], metadata: { etag?: string; lastModified?: string }): Promise<void>;
  markSourceError(id: string, error: string): Promise<void>;
  findConnection(id: string, userId?: string): Promise<CalendarConnectionRecord | null>;
  upsertConnection(data: { userId: string; accountEmail: string; encryptedRefreshToken: string | null }): Promise<CalendarConnectionRecord>;
  updateConnection(id: string, data: { accessTokenExpiresAt?: Date; status?: string; lastError?: string | null; encryptedRefreshToken?: string | null }): Promise<void>;
  listGoogleConnectionIds(): Promise<string[]>;
  upsertGoogleSource(data: { userId: string; connectionId: string; providerCalendarId: string; name: string; color: string }): Promise<CalendarSourceRecord>;
  applyGoogleEvents(calendar: CalendarSourceRecord, changes: CalendarEventChange[], syncToken: string | null, nextSyncToken: string | null): Promise<void>;
  saveWatch(calendarId: string, data: CalendarWatch): Promise<void>;
  findConnectionIdByChannel(channelId: string): Promise<string | null>;
}

/** Network and credential boundary. Persistence is deliberately absent. */
export interface CalendarIntegrationPort {
  normalizeIcsUrl(url: string): string;
  fetchIcs(url: string, from: Date, to: Date): Promise<CalendarIcsSnapshot>;
  googleConnectUrl(userId: string): string;
  googleCallback(code: string, state: string): Promise<{ userId: string; accountEmail: string; encryptedRefreshToken: string | null }>;
  syncGoogleConnection(connection: CalendarConnectionRecord, sources: CalendarSourceRecord[]): Promise<CalendarGoogleSync>;
}

export const CALENDAR_REPOSITORY_PORT = Symbol('CALENDAR_REPOSITORY_PORT');
export const CALENDAR_INTEGRATION_PORT = Symbol('CALENDAR_INTEGRATION_PORT');
