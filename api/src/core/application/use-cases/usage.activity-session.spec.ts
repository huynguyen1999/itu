import { UsageService } from './usage.service';

describe('Website Activity Sessions', () => {
  const repo: any = {
    ensureBrowserExtensionDevice: jest.fn().mockResolvedValue('browser-install-1'),
    getTrackingPreferences: jest.fn().mockResolvedValue({ trackingEnabled: true, websiteTrackingEnabled: true, retentionDays: 90 }),
    ingestWebsiteActivitySessions: jest.fn().mockResolvedValue(['session-1']),
    findWebsiteActivitySessions: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.ensureBrowserExtensionDevice.mockResolvedValue('browser-install-1');
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, websiteTrackingEnabled: true, retentionDays: 90 });
    repo.ingestWebsiteActivitySessions.mockResolvedValue(['session-1']);
  });

  it('derives active seconds and partially acknowledges invalid records', async () => {
    const result = await new UsageService(repo).ingestWebsiteActivitySessions('user-1', {
      installationId: 'install-1',
      sessions: [
        {
          id: 'session-1',
          startedAt: '2026-08-11T10:00:00.000Z',
          endedAt: '2026-08-11T10:01:05.900Z',
          browserBundleId: 'chrome',
          browserDisplayName: 'Chrome',
          hostname: 'Example.COM',
          url: 'https://example.com/path?secret=1#fragment',
          iconUrl: 'https://cdn.example.com/favicon.png?cache=1#icon',
          pageTitle: '  Hello\nWorld  ',
          isPrivate: false,
          timezone: 'UTC',
        },
        {
          id: 'bad',
          startedAt: '2026-08-11T10:01:00.000Z',
          endedAt: '2026-08-11T10:00:00.000Z',
          browserBundleId: 'chrome',
          browserDisplayName: 'Chrome',
          hostname: 'example.com',
          url: 'https://example.com/',
          isPrivate: false,
          timezone: 'UTC',
        },
      ],
    });

    expect(result).toEqual({ accepted: ['session-1'], rejected: [{ id: 'bad', reason: expect.stringContaining('duration') }] });
    expect(repo.ingestWebsiteActivitySessions).toHaveBeenCalledWith('user-1', [expect.objectContaining({
      id: 'session-1', activeSeconds: 65, hostname: 'example.com', url: 'https://example.com/path', iconUrl: 'https://cdn.example.com/favicon.png', pageTitle: 'Hello World',
    })]);
  });

  it('drops malformed favicon URLs without rejecting the activity session', async () => {
    repo.ingestWebsiteActivitySessions.mockResolvedValue(['session-icon']);
    const result = await new UsageService(repo).ingestWebsiteActivitySessions('user-1', {
      installationId: 'install-1',
      sessions: [{
        id: 'session-icon', startedAt: '2026-08-11T10:00:00.000Z', endedAt: '2026-08-11T10:01:00.000Z',
        browserBundleId: 'chrome', browserDisplayName: 'Chrome', hostname: 'example.com',
        url: 'https://example.com/path', iconUrl: 'data:image/png;base64,not-stored', pageTitle: null,
        isPrivate: false, timezone: 'UTC',
      }],
    });

    expect(result).toEqual({ accepted: ['session-icon'], rejected: [] });
    expect(repo.ingestWebsiteActivitySessions).toHaveBeenCalledWith('user-1', [expect.objectContaining({ iconUrl: null })]);
  });

  it('rejects duplicate IDs and URLs from another hostname without dropping valid private rows', async () => {
    repo.ingestWebsiteActivitySessions.mockResolvedValue(['session-2']);
    const result = await new UsageService(repo).ingestWebsiteActivitySessions('user-1', {
      installationId: 'install-1',
      sessions: [
        {
          id: 'session-1', startedAt: '2026-08-11T10:00:00.000Z', endedAt: '2026-08-11T10:01:00.000Z',
          browserBundleId: 'chrome', browserDisplayName: 'Chrome', hostname: 'example.com',
          url: 'https://example.com/private', pageTitle: 'private', isPrivate: true, timezone: 'UTC',
        },
        {
          id: 'session-1', startedAt: '2026-08-11T10:01:00.000Z', endedAt: '2026-08-11T10:02:00.000Z',
          browserBundleId: 'chrome', browserDisplayName: 'Chrome', hostname: 'example.com',
          url: 'https://example.com/private', pageTitle: '\u0000 Private  Page ', isPrivate: true, timezone: 'UTC',
        },
        {
          id: 'invalid-url', startedAt: '2026-08-11T10:02:00.000Z', endedAt: '2026-08-11T10:03:00.000Z',
          browserBundleId: 'chrome', browserDisplayName: 'Chrome', hostname: 'example.com',
          url: 'https://other.example/path', pageTitle: 'ignored', isPrivate: true, timezone: 'UTC',
        },
        {
          id: 'session-2', startedAt: '2026-08-11T10:03:00.000Z', endedAt: '2026-08-11T10:04:00.000Z',
          browserBundleId: 'chrome', browserDisplayName: 'Chrome', hostname: 'example.com',
          url: 'https://example.com/private', pageTitle: '\u0000 Private  Page ', isPrivate: true, timezone: 'UTC',
        },
      ],
    });

    expect(result.accepted).toEqual(['session-2']);
    expect(result.rejected).toEqual([
      { id: 'session-1', reason: 'duplicate session id' },
      { id: 'invalid-url', reason: 'url must be a valid HTTP(S) URL matching hostname' },
    ]);
    expect(repo.ingestWebsiteActivitySessions).toHaveBeenCalledWith('user-1', expect.arrayContaining([
      expect.objectContaining({ id: 'session-1', activeSeconds: 60, isPrivate: true, pageTitle: 'private' }),
      expect.objectContaining({ id: 'session-2', activeSeconds: 60, isPrivate: true, url: 'https://example.com/private', pageTitle: 'Private Page' }),
    ]));
  });

  it('returns every input ID as rejected when website tracking is disabled', async () => {
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, websiteTrackingEnabled: false, retentionDays: 90 });
    const result = await new UsageService(repo).ingestWebsiteActivitySessions('user-1', {
      installationId: 'install-1',
      sessions: [{
        id: 'session-1', startedAt: '2026-08-11T10:00:00.000Z', endedAt: '2026-08-11T10:01:00.000Z',
        browserBundleId: 'chrome', browserDisplayName: 'Chrome', hostname: 'example.com',
        url: 'https://example.com/path', pageTitle: null, isPrivate: false, timezone: 'UTC',
      }],
    });
    expect(result).toEqual({ accepted: [], rejected: [{ id: 'session-1', reason: 'tracking_disabled' }] });
    expect(repo.ingestWebsiteActivitySessions).not.toHaveBeenCalled();
  });

  it('maps installation ownership failures to a forbidden response', async () => {
    repo.ensureBrowserExtensionDevice.mockRejectedValue(new Error('belongs to another user'));
    await expect(new UsageService(repo).ingestWebsiteActivitySessions('user-1', { installationId: 'install-1', sessions: [] }))
      .rejects.toThrow('Website installation does not belong to this user');
  });

  it('returns server-derived private-aware URL detail and exact sessions', async () => {
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, websiteTrackingEnabled: true, retentionDays: 90 });
    repo.findWebsiteActivitySessions.mockResolvedValue([
      {
        id: 'session-1', installationId: 'install-1', browserBundleId: 'chrome', browserDisplayName: 'Chrome',
        startedAt: new Date('2026-08-11T10:00:00.000Z'), endedAt: new Date('2026-08-11T10:01:00.000Z'),
        activeSeconds: 60, hostname: 'example.com', url: 'https://example.com/path/', iconUrl: 'https://example.com/icon.png', pageTitle: 'Latest', isPrivate: true, timezone: 'UTC', userId: 'user-1',
        createdAt: new Date('2026-08-11T10:01:01.000Z'),
      },
    ]);
    const result = await new UsageService(repo).getWebsiteStatistics('user-1', '2026-08-11', '2026-08-11');
    expect(result.totalActiveSeconds).toBe(60);
    expect(result.urlDetails).toEqual([{ url: 'https://example.com/path/', hostname: 'example.com', activeSeconds: 60, latestTitle: 'Latest', iconUrl: 'https://example.com/icon.png', isPrivate: true }]);
    expect(result.sessions[0]).toMatchObject({ id: 'session-1', activeSeconds: 60, isPrivate: true });
  });

  it('re-uploads a stable session id as its checkpoint advances', async () => {
    const service = new UsageService(repo);
    const base = {
      id: 'session-1', installationId: 'install-1', startedAt: '2026-08-11T10:00:00.000Z',
      browserBundleId: 'chrome', browserDisplayName: 'Chrome', hostname: 'example.com', url: 'https://example.com/',
      isPrivate: false, timezone: 'UTC',
    };
    await service.ingestWebsiteActivitySessions('user-1', { sessions: [{ ...base, endedAt: '2026-08-11T10:01:00.000Z', pageTitle: 'Old' }] , installationId: 'install-1' });
    await service.ingestWebsiteActivitySessions('user-1', { sessions: [{ ...base, endedAt: '2026-08-11T10:02:00.000Z', pageTitle: 'New' }] , installationId: 'install-1' });
    expect(repo.ingestWebsiteActivitySessions).toHaveBeenCalledTimes(2);
    expect(repo.ingestWebsiteActivitySessions.mock.calls[1][1][0]).toEqual(expect.objectContaining({ activeSeconds: 120, pageTitle: 'New' }));
  });

  it('buckets and filters sessions by their local timezone date', async () => {
    repo.findWebsiteActivitySessions.mockResolvedValue([
      {
        id: 'tz-session', installationId: 'install-1', browserBundleId: 'chrome', browserDisplayName: 'Chrome',
        startedAt: new Date('2026-08-10T17:30:00.000Z'), endedAt: new Date('2026-08-10T17:31:00.000Z'),
        activeSeconds: 60, hostname: 'example.com', url: 'https://example.com/', pageTitle: 'Local midnight', isPrivate: false, timezone: 'Asia/Ho_Chi_Minh', userId: 'user-1',
        createdAt: new Date('2026-08-10T17:31:01.000Z'),
      },
      {
        id: 'old-session', installationId: 'install-1', browserBundleId: 'chrome', browserDisplayName: 'Chrome',
        startedAt: new Date('2026-08-10T16:30:00.000Z'), endedAt: new Date('2026-08-10T16:31:00.000Z'),
        activeSeconds: 60, hostname: 'example.com', url: 'https://example.com/', pageTitle: 'Previous local day', isPrivate: false, timezone: 'Asia/Ho_Chi_Minh', userId: 'user-1',
        createdAt: new Date('2026-08-10T16:31:01.000Z'),
      },
    ]);
    const result = await new UsageService(repo).getWebsiteStatistics('user-1', '2026-08-11', '2026-08-11');
    expect(result.totalActiveSeconds).toBe(60);
    expect(result.daily).toEqual([{ localDate: '2026-08-11', activeSeconds: 60 }]);
    expect(result.sessions[0]).toMatchObject({ id: 'tz-session', localDate: '2026-08-11' });
    expect(repo.findWebsiteActivitySessions).toHaveBeenCalledWith('user-1', new Date('2026-08-10T00:00:00.000Z'), new Date('2026-08-13T00:00:00.000Z'));
  });

  it('rejects an installation claimed by another user', async () => {
    repo.ensureBrowserExtensionDevice.mockRejectedValueOnce(new Error('belongs to another user'));
    await expect(new UsageService(repo).ingestWebsiteActivitySessions('user-2', {
      installationId: 'install-1', sessions: [],
    })).rejects.toThrow('does not belong to this user');
    expect(repo.ingestWebsiteActivitySessions).not.toHaveBeenCalled();
  });
});
