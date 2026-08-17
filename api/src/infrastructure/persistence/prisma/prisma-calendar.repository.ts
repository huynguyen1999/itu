import { Injectable } from '@nestjs/common';
import { CalendarProvider, Prisma } from '@prisma/client';
import type {
  CalendarConnectionRecord,
  CalendarEventChange,
  CalendarEventRecord,
  CalendarRepositoryPort,
  CalendarSourceRecord,
  ParsedCalendarEvent,
} from '@core/application/ports/out/calendar.port';
import { createUlid } from './ulid';
import { PrismaService } from './prisma.service';

const sourceSelect = {
  id: true, userId: true, provider: true, connectionId: true, providerCalendarId: true,
  name: true, url: true, color: true, visible: true, syncToken: true, etag: true,
  lastModified: true, lastFetchedAt: true, lastSuccessfulSyncAt: true, lastError: true,
  channelId: true, resourceId: true, channelExpiration: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ExternalCalendarSelect;

@Injectable()
export class PrismaCalendarRepository implements CalendarRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listVisibleEvents(userId: string, from: Date, to: Date): Promise<CalendarEventRecord[]> {
    return this.prisma.externalCalendarEvent.findMany({
      where: {
        userId,
        calendar: { visible: true },
        OR: [
          { startAt: { lt: to }, endAt: { gt: from } },
          { endAt: null, startAt: { gte: from, lt: to } },
        ],
      },
      include: { calendar: { select: { name: true, color: true } } },
      take: 500,
    }) as Promise<CalendarEventRecord[]>;
  }

  async listSources(userId: string): Promise<CalendarSourceRecord[]> {
    const sources = await this.prisma.externalCalendar.findMany({ where: { userId }, orderBy: [{ visible: 'desc' }, { name: 'asc' }], select: sourceSelect });
    return sources.map((source) => this.mapSource(source));
  }

  async findSource(userId: string, id: string): Promise<CalendarSourceRecord | null> {
    const source = await this.prisma.externalCalendar.findFirst({ where: { id, userId }, select: sourceSelect });
    return source ? this.mapSource(source) : null;
  }

  async findSourceById(id: string): Promise<CalendarSourceRecord | null> {
    const source = await this.prisma.externalCalendar.findUnique({ where: { id }, select: sourceSelect });
    return source ? this.mapSource(source) : null;
  }

  async createSource(data: { userId: string; provider: 'ICS' | 'GOOGLE'; url?: string; name: string }): Promise<CalendarSourceRecord> {
    const source = await this.prisma.externalCalendar.create({ data: { id: createUlid(), userId: data.userId, provider: data.provider as CalendarProvider, url: data.url, name: data.name }, select: sourceSelect });
    return this.mapSource(source);
  }

  updateSource(userId: string, id: string, data: { visible?: boolean; color?: string }) {
    return this.prisma.externalCalendar.updateMany({ where: { id, userId }, data });
  }

  deleteSource(userId: string, id: string) {
    return this.prisma.externalCalendar.deleteMany({ where: { id, userId } });
  }

  async replaceIcsEvents(calendarId: string, userId: string, events: ParsedCalendarEvent[], metadata: { etag?: string; lastModified?: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.externalCalendarEvent.deleteMany({ where: { calendarId } });
      if (events.length) await tx.externalCalendarEvent.createMany({ data: events.map((event) => ({ id: createUlid(), userId, calendarId, ...event, readOnly: true })) });
      await tx.externalCalendar.update({ where: { id: calendarId }, data: { etag: metadata.etag, lastModified: metadata.lastModified, lastFetchedAt: new Date(), lastSuccessfulSyncAt: new Date(), lastError: null } });
    });
  }

  async markSourceError(id: string, error: string): Promise<void> {
    await this.prisma.externalCalendar.update({ where: { id }, data: { lastFetchedAt: new Date(), lastError: error } }).catch(() => undefined);
  }

  async findConnection(id: string, userId?: string): Promise<CalendarConnectionRecord | null> {
    const connection = await this.prisma.calendarConnection.findFirst({ where: { id, ...(userId ? { userId } : {}), provider: CalendarProvider.GOOGLE } });
    return connection ? this.mapConnection(connection) : null;
  }

  async findConnectionByAccount(userId: string, accountEmail: string): Promise<CalendarConnectionRecord | null> {
    const connection = await this.prisma.calendarConnection.findFirst({ where: { userId, provider: CalendarProvider.GOOGLE, accountEmail } });
    return connection ? this.mapConnection(connection) : null;
  }

  async upsertConnection(data: { userId: string; accountEmail: string; encryptedRefreshToken: string | null }): Promise<CalendarConnectionRecord> {
    const existing = await this.findConnectionByAccount(data.userId, data.accountEmail);
    const connection = existing
      ? await this.prisma.calendarConnection.update({ where: { id: existing.id }, data: { encryptedRefreshToken: data.encryptedRefreshToken ?? existing.encryptedRefreshToken, status: 'CONNECTED', lastError: null } })
      : await this.prisma.calendarConnection.create({ data: { id: createUlid(), userId: data.userId, provider: CalendarProvider.GOOGLE, accountEmail: data.accountEmail, encryptedRefreshToken: data.encryptedRefreshToken } });
    return this.mapConnection(connection);
  }

  async updateConnection(id: string, data: { accessTokenExpiresAt?: Date; status?: string; lastError?: string | null; encryptedRefreshToken?: string | null }): Promise<void> {
    await this.prisma.calendarConnection.update({ where: { id }, data: { ...data, status: data.status as 'CONNECTED' | 'ERROR' | 'DISCONNECTED' | undefined } });
  }

  async listGoogleConnectionIds(): Promise<string[]> {
    const rows = await this.prisma.calendarConnection.findMany({ where: { provider: CalendarProvider.GOOGLE, status: { not: 'DISCONNECTED' } }, select: { id: true } });
    return rows.map(({ id }) => id);
  }

  async upsertGoogleSource(data: { userId: string; connectionId: string; providerCalendarId: string; name: string; color: string }): Promise<CalendarSourceRecord> {
    const existingRecord = await this.prisma.externalCalendar.findFirst({ where: { connectionId: data.connectionId, provider: CalendarProvider.GOOGLE, providerCalendarId: data.providerCalendarId }, select: sourceSelect });
    const existing = existingRecord ? this.mapSource(existingRecord) : null;
    const source = existing
      ? await this.prisma.externalCalendar.update({ where: { id: existing.id }, data: { name: data.name, color: data.color }, select: sourceSelect })
      : await this.prisma.externalCalendar.create({ data: { id: createUlid(), userId: data.userId, connectionId: data.connectionId, provider: CalendarProvider.GOOGLE, providerCalendarId: data.providerCalendarId, name: data.name, color: data.color }, select: sourceSelect });
    return this.mapSource(source);
  }

  async applyGoogleEvents(calendar: CalendarSourceRecord, changes: CalendarEventChange[], syncToken: string | null, nextSyncToken: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!syncToken) await tx.externalCalendarEvent.deleteMany({ where: { calendarId: calendar.id } });
      for (const change of changes) {
        const recurrenceId = change.recurrenceId;
        if (change.deleted || !change.event) {
          await tx.externalCalendarEvent.deleteMany({ where: { calendarId: calendar.id, externalId: change.externalId, ...(recurrenceId ? { recurrenceId } : {}) } });
          continue;
        }
        const event = change.event;
        const existing = await tx.externalCalendarEvent.findFirst({ where: { calendarId: calendar.id, externalId: change.externalId, recurrenceId } });
        const data = { title: event.title, description: event.description, location: event.location, startAt: event.startAt, endAt: event.endAt, allDay: event.allDay, timeZone: event.timeZone, status: event.status, etag: change.etag, readOnly: true };
        if (existing) await tx.externalCalendarEvent.update({ where: { id: existing.id }, data });
        else await tx.externalCalendarEvent.create({ data: { id: createUlid(), userId: calendar.userId, calendarId: calendar.id, externalId: change.externalId, recurrenceId, ...data } });
      }
      await tx.externalCalendar.update({ where: { id: calendar.id }, data: { syncToken: nextSyncToken ?? syncToken, lastFetchedAt: new Date(), lastSuccessfulSyncAt: new Date(), lastError: null } });
    });
  }

  async clearSyncToken(calendarId: string): Promise<void> { await this.prisma.externalCalendar.update({ where: { id: calendarId }, data: { syncToken: null } }); }

  async saveWatch(calendarId: string, data: { channelId: string; resourceId: string; channelExpiration: Date | null }): Promise<void> { await this.prisma.externalCalendar.update({ where: { id: calendarId }, data }); }

  async findConnectionIdByChannel(channelId: string): Promise<string | null> {
    const source = await this.prisma.externalCalendar.findFirst({ where: { channelId }, select: { connectionId: true } });
    return source?.connectionId ?? null;
  }

  private mapSource(source: Prisma.ExternalCalendarGetPayload<{ select: typeof sourceSelect }>): CalendarSourceRecord {
    return { ...source, provider: source.provider as 'ICS' | 'GOOGLE' };
  }

  private mapConnection(connection: { id: string; userId: string; provider: CalendarProvider; accountEmail: string | null; encryptedRefreshToken: string | null }): CalendarConnectionRecord {
    return { ...connection, provider: connection.provider as 'ICS' | 'GOOGLE' };
  }
}
