import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CALENDAR_INTEGRATION_PORT, CALENDAR_REPOSITORY_PORT } from '@core/application/ports/out/calendar.port';
import type { CalendarIntegrationPort, CalendarRepositoryPort } from '@core/application/ports/out/calendar.port';

const RANGE_BEFORE_MONTHS = 3;
const RANGE_AFTER_MONTHS = 12;

@Injectable()
export class CalendarSyncService {
  constructor(
    @Inject(CALENDAR_REPOSITORY_PORT) private readonly repository: CalendarRepositoryPort,
    @Inject(CALENDAR_INTEGRATION_PORT) private readonly integration: CalendarIntegrationPort,
  ) {}

  async list(userId: string) {
    return (await this.repository.listSources(userId)).map(({ id, provider, name, url, color, visible, lastSuccessfulSyncAt, lastError }) => ({
      id, provider, name, url, color, visible, lastSuccessfulSyncAt, lastError,
    }));
  }

  async createIcs(userId: string, url: string, name?: string) {
    const safeUrl = this.integration.normalizeIcsUrl(url);
    const source = await this.repository.createSource({ userId, provider: 'ICS', url: safeUrl, name: name?.trim() || new URL(safeUrl).hostname });
    try {
      return await this.syncIcs(userId, source.id);
    } catch (error) {
      await this.repository.markSourceError(source.id, safeError(error));
      throw error;
    }
  }

  async syncIcs(userId: string, calendarId: string) {
    const source = await this.repository.findSource(userId, calendarId);
    if (!source?.url || source.provider !== 'ICS') throw new BadRequestException('ICS calendar was not found');
    try {
      const { from, to } = syncRange();
      const snapshot = await this.integration.fetchIcs(source.url, from, to);
      await this.repository.replaceIcsEvents(calendarId, userId, snapshot.events, { etag: snapshot.etag, lastModified: snapshot.lastModified });
      return this.repository.findSourceById(calendarId);
    } catch (error) {
      await this.repository.markSourceError(calendarId, safeError(error));
      throw error;
    }
  }

  update(userId: string, id: string, data: { visible?: boolean; color?: string }) {
    return this.repository.updateSource(userId, id, data);
  }

  async refresh(userId: string, id: string) {
    const source = await this.repository.findSource(userId, id);
    if (!source) throw new BadRequestException('Calendar source was not found');
    if (source.provider === 'ICS') return this.syncIcs(userId, id);
    if (!source.connectionId) throw new BadRequestException('Google Calendar connection was not found');
    return this.syncGoogleConnection(source.connectionId, userId);
  }

  async remove(userId: string, id: string) {
    await this.repository.deleteSource(userId, id);
  }

  googleConnectUrl(userId: string) {
    return this.integration.googleConnectUrl(userId);
  }

  async googleCallback(code: string, state: string) {
    const callback = await this.integration.googleCallback(code, state);
    const connection = await this.repository.upsertConnection({
      userId: callback.userId,
      accountEmail: callback.accountEmail,
      encryptedRefreshToken: callback.encryptedRefreshToken,
    });
    await this.syncGoogleConnection(connection.id);
    return { userId: callback.userId };
  }

  async syncGoogleConnection(connectionId: string, userId?: string) {
    const connection = await this.repository.findConnection(connectionId, userId);
    if (!connection?.encryptedRefreshToken) throw new BadRequestException('Google Calendar is not connected');
    try {
      const sources = (await this.repository.listSources(connection.userId)).filter(
        (source) => source.provider === 'GOOGLE' && source.connectionId === connection.id,
      );
      const synced = await this.integration.syncGoogleConnection(connection, sources);
      await this.repository.updateConnection(connection.id, {
        accessTokenExpiresAt: synced.accessTokenExpiresAt,
        status: 'CONNECTED',
        lastError: null,
      });

      for (const calendar of synced.calendars) {
        const existing = sources.find((source) => source.providerCalendarId === calendar.providerCalendarId);
        const source = await this.repository.upsertGoogleSource({
          userId: connection.userId,
          connectionId: connection.id,
          providerCalendarId: calendar.providerCalendarId,
          name: calendar.name,
          // Keep a user-selected color when Google does not return one.
          color: calendar.color ?? existing?.color ?? 'BLUE',
        });
        await this.repository.applyGoogleEvents(source, calendar.events, calendar.syncToken, calendar.nextSyncToken ?? calendar.syncToken);
        if (calendar.watch) await this.repository.saveWatch(source.id, calendar.watch);
      }
      return this.list(connection.userId);
    } catch (error) {
      await this.repository.updateConnection(connection.id, { status: 'ERROR', lastError: safeError(error) }).catch(() => undefined);
      throw error;
    }
  }

  async syncAllGoogle() {
    await Promise.allSettled((await this.repository.listGoogleConnectionIds()).map((id) => this.syncGoogleConnection(id)));
  }

  async handleGoogleWebhook(channelId?: string) {
    if (!channelId) return;
    const connectionId = await this.repository.findConnectionIdByChannel(channelId);
    if (connectionId) void this.syncGoogleConnection(connectionId).catch(() => undefined);
  }
}

function syncRange() {
  const from = new Date();
  from.setMonth(from.getMonth() - RANGE_BEFORE_MONTHS);
  const to = new Date();
  to.setMonth(to.getMonth() + RANGE_AFTER_MONTHS);
  return { from, to };
}

function safeError(error: unknown): string {
  if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) return error.message;
  return 'Calendar synchronization failed';
}
