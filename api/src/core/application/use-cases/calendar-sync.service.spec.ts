import { CONFIG_KEYS } from '@core/application/constants/app.constants';
import { CalendarIntegrationProvider } from '@infrastructure/calendar/calendar-integration.provider';
import { CalendarSyncService } from './calendar-sync.service';

const sourceRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'calendar-1', userId: 'user-1', provider: 'ICS', connectionId: null, providerCalendarId: null,
  name: 'Work', url: 'https://calendar.example.test/work.ics', color: 'BLUE', visible: true,
  syncToken: null, etag: null, lastModified: null, lastFetchedAt: null, lastSuccessfulSyncAt: null,
  lastError: null, channelId: null, resourceId: null, channelExpiration: null,
  createdAt: new Date('2026-08-12T00:00:00.000Z'), updatedAt: new Date('2026-08-12T00:01:00.000Z'),
  ...overrides,
});

describe('CalendarSyncService', () => {
  it('delegates source operations to the integration port', async () => {
    const repository = {
      listSources: jest.fn().mockResolvedValue([]),
      updateSource: jest.fn().mockResolvedValue({ count: 1 }),
      deleteSource: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const integration = {};
    const service = new CalendarSyncService(repository as any, integration as any);
    await service.list('user-1'); await service.update('user-1', 'calendar-1', { visible: false, color: 'RED' }); await service.remove('user-1', 'calendar-1');
    expect(repository.listSources).toHaveBeenCalledWith('user-1'); expect(repository.updateSource).toHaveBeenCalledWith('user-1', 'calendar-1', { visible: false, color: 'RED' }); expect(repository.deleteSource).toHaveBeenCalledWith('user-1', 'calendar-1');
  });

  it('builds a signed Google authorization URL and preserves callback failures', async () => {
    const config = { get: jest.fn((key: string, fallback?: string) => key === CONFIG_KEYS.googleClientId ? 'google-client' : key === CONFIG_KEYS.apiOrigin ? 'https://api.example.test' : fallback), getOrThrow: jest.fn().mockReturnValue('calendar-state-secret') };
    const provider = new CalendarIntegrationProvider(config as any);
    const service = new CalendarSyncService({} as any, provider);
    const url = new URL(service.googleConnectUrl('user-1'));
    expect(url.origin).toBe('https://accounts.google.com'); expect(url.searchParams.get('client_id')).toBe('google-client'); expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.test/calendar/google/callback'); expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.readonly');
    await expect(service.googleCallback('code', 'not-a-state')).rejects.toThrow('Google Calendar state is invalid');
  });

  it('scopes ICS reads and preserves source timestamps in create responses', async () => {
    const source = sourceRecord();
    const repository = {
      createSource: jest.fn().mockResolvedValue(source),
      findSource: jest.fn().mockResolvedValue(source),
      findSourceById: jest.fn().mockResolvedValue(source),
      replaceIcsEvents: jest.fn().mockResolvedValue(undefined),
      markSourceError: jest.fn().mockResolvedValue(undefined),
    };
    const integration = {
      normalizeIcsUrl: jest.fn().mockReturnValue(source.url),
      fetchIcs: jest.fn().mockResolvedValue({ events: [], etag: 'etag-1', lastModified: 'yesterday' }),
    };

    const service = new CalendarSyncService(repository as any, integration as any);
    const result = await service.createIcs('user-1', source.url);
    const refreshed = await service.syncIcs('user-1', source.id);

    expect(repository.createSource).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', provider: 'ICS' }));
    expect(repository.findSource).toHaveBeenCalledWith('user-1', source.id);
    expect(repository.replaceIcsEvents).toHaveBeenCalledWith(source.id, 'user-1', [], { etag: 'etag-1', lastModified: 'yesterday' });
    expect(result).toMatchObject({ createdAt: source.createdAt, updatedAt: source.updatedAt });
    expect(refreshed).toMatchObject({ createdAt: source.createdAt, updatedAt: source.updatedAt });
  });

  it('keeps an existing Google source color when the provider omits one', async () => {
    const connection = { id: 'connection-1', userId: 'user-1', provider: 'GOOGLE', accountEmail: 'user@example.test', encryptedRefreshToken: 'encrypted' };
    const source = sourceRecord({ provider: 'GOOGLE', connectionId: connection.id, providerCalendarId: 'remote-1', color: 'ORANGE' });
    const repository = {
      findConnection: jest.fn().mockResolvedValue(connection),
      listSources: jest.fn().mockResolvedValue([source]),
      updateConnection: jest.fn().mockResolvedValue(undefined),
      upsertGoogleSource: jest.fn().mockResolvedValue(source),
      applyGoogleEvents: jest.fn().mockResolvedValue(undefined),
    };
    const integration = {
      syncGoogleConnection: jest.fn().mockResolvedValue({ accessTokenExpiresAt: new Date('2026-08-12T01:00:00.000Z'), calendars: [{ providerCalendarId: 'remote-1', name: 'Work', color: undefined, events: [], syncToken: 'next', nextSyncToken: null, watch: null }] }),
    };

    await new CalendarSyncService(repository as any, integration as any).syncGoogleConnection(connection.id, 'user-1');

    expect(repository.findConnection).toHaveBeenCalledWith(connection.id, 'user-1');
    expect(repository.upsertGoogleSource).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', color: 'ORANGE' }));
  });

  it('orchestrates the Google callback through connection upsert and initial sync', async () => {
    const callback = { userId: 'user-1', accountEmail: 'user@example.test', encryptedRefreshToken: 'encrypted-token' };
    const connection = { id: 'connection-1' };
    const integration = { googleCallback: jest.fn().mockResolvedValue(callback) };
    const repository = { upsertConnection: jest.fn().mockResolvedValue(connection) };
    const service = new CalendarSyncService(repository as any, integration as any);
    const sync = jest.spyOn(service, 'syncGoogleConnection').mockResolvedValue([]);

    await expect(service.googleCallback('code', 'state')).resolves.toEqual({ userId: 'user-1' });

    expect(repository.upsertConnection).toHaveBeenCalledWith(callback);
    expect(sync).toHaveBeenCalledWith(connection.id);
  });
});
