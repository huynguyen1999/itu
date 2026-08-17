import { CONFIG_KEYS } from '@core/application/constants/app.constants';
import { CalendarIntegrationProvider, parseIcsEvents } from './calendar-integration.provider';

describe('CalendarIntegrationProvider', () => {
  it('expands recurring and all-day ICS events while excluding cancelled entries', () => {
    const events = parseIcsEvents('BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:weekly\nDTSTART:20260810T090000Z\nDTEND:20260810T100000Z\nRRULE:FREQ=WEEKLY;COUNT=2\nSUMMARY:Standup\nEND:VEVENT\nBEGIN:VEVENT\nUID:holiday\nDTSTART;VALUE=DATE:20260815\nDTEND;VALUE=DATE:20260816\nSUMMARY:Holiday\nLOCATION:Home\nEND:VEVENT\nBEGIN:VEVENT\nUID:cancelled\nDTSTART:20260810T110000Z\nSTATUS:CANCELLED\nSUMMARY:Nope\nEND:VEVENT\nEND:VCALENDAR', new Date('2026-08-09T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));
    expect(events).toHaveLength(3);
    expect(events[0].recurrenceId).toBeTruthy();
    expect(events.find((event) => event.externalId === 'holiday')).toEqual(expect.objectContaining({ allDay: true, location: 'Home' }));
  });

  it('builds signed Google authorization URLs without application dependencies', () => {
    const config = { get: jest.fn((key: string, fallback?: string) => key === CONFIG_KEYS.googleClientId ? 'google-client' : key === CONFIG_KEYS.apiOrigin ? 'https://api.example.test' : fallback), getOrThrow: jest.fn().mockReturnValue('calendar-state-secret') };
    const provider = new CalendarIntegrationProvider(config as any);
    const url = new URL(provider.googleConnectUrl('user-1'));
    expect(url.searchParams.get('client_id')).toBe('google-client');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.readonly');
    expect(url.searchParams.get('state')).toMatch(/^[^.]+\.[^.]+$/);
  });

  it('encrypts refresh tokens returned by the Google callback', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === CONFIG_KEYS.googleClientId) return 'google-client';
        if (key === CONFIG_KEYS.googleClientSecret) return 'google-secret';
        if (key === CONFIG_KEYS.apiOrigin) return 'https://api.example.test';
        return fallback;
      }),
      getOrThrow: jest.fn().mockReturnValue('calendar-state-secret'),
    };
    const provider = new CalendarIntegrationProvider(config as any);
    const state = new URL(provider.googleConnectUrl('user-1')).searchParams.get('state')!;
    const fetch = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ email: 'user@example.test' }) } as Response);

    const callback = await provider.googleCallback('auth-code', state);

    expect(callback).toMatchObject({ userId: 'user-1', accountEmail: 'user@example.test' });
    expect(callback.encryptedRefreshToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect(callback.encryptedRefreshToken).not.toBe('refresh-token');
    fetch.mockRestore();
  });

  it('resets stale Google sync tokens and normalizes event changes', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: string) => key === CONFIG_KEYS.googleClientId || key === CONFIG_KEYS.googleClientSecret ? 'google-client' : fallback),
      getOrThrow: jest.fn().mockReturnValue('calendar-state-secret'),
    };
    const provider = new CalendarIntegrationProvider(config as any);
    const state = new URL(provider.googleConnectUrl('user-1')).searchParams.get('state')!;
    const fetch = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ email: 'user@example.test' }) } as Response);
    const callback = await provider.googleCallback('auth-code', state);
    fetch.mockReset()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'access-token', expires_in: 3600 }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [{ id: 'remote-calendar', summary: 'Work' }] }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 410, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({
        items: [
          { id: 'deleted-event', status: 'cancelled', etag: 'deleted-etag' },
          { id: 'event-1', summary: 'Planning', description: 'Agenda', location: 'Room 1', start: { dateTime: '2026-08-13T09:00:00Z', timeZone: 'UTC' }, end: { dateTime: '2026-08-13T10:00:00Z', timeZone: 'UTC' }, etag: 'event-etag' },
        ],
        nextSyncToken: 'fresh-token',
      }) } as Response);

    const result = await provider.syncGoogleConnection(
      { id: 'connection-1', userId: 'user-1', provider: 'GOOGLE', accountEmail: 'user@example.test', encryptedRefreshToken: callback.encryptedRefreshToken },
      [{ id: 'calendar-1', providerCalendarId: 'remote-calendar', syncToken: 'stale-token', channelExpiration: null } as any],
    );

    expect(result.calendars[0]).toMatchObject({ providerCalendarId: 'remote-calendar', syncToken: null, nextSyncToken: 'fresh-token' });
    expect(result.calendars[0].events).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalId: 'deleted-event', deleted: true, event: null, etag: 'deleted-etag' }),
      expect.objectContaining({ externalId: 'event-1', deleted: false, event: expect.objectContaining({ title: 'Planning', allDay: false, timeZone: 'UTC', status: 'CONFIRMED' }) }),
    ]));
    const eventUrls = fetch.mock.calls.slice(2).map(([input]) => String(input));
    expect(eventUrls[0]).toContain('syncToken=stale-token');
    expect(eventUrls[1]).not.toContain('syncToken=');
    fetch.mockRestore();
  });

  it('normalizes webcal and webcals protocols to http/https', () => {
    const provider = new CalendarIntegrationProvider({} as any);
    expect(provider.normalizeIcsUrl('webcal://example.com/calendar.ics')).toBe('http://example.com/calendar.ics');
    expect(provider.normalizeIcsUrl('webcals://example.com/calendar.ics')).toBe('https://example.com/calendar.ics');
  });

  it('registers VTIMEZONE definitions when parsing ICS events with custom timezone IDs', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTIMEZONE',
      'TZID:CustomZone',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0000',
      'TZOFFSETTO:+0000',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:tz-event',
      'DTSTART;TZID=CustomZone:20260812T100000',
      'DTEND;TZID=CustomZone:20260812T110000',
      'SUMMARY:Custom Zone Meeting',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseIcsEvents(ics, new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Custom Zone Meeting');
  });
});
