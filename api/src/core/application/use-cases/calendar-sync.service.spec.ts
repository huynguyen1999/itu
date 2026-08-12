import { parseIcsEvents } from './calendar-sync.service';

describe('parseIcsEvents', () => {
  it('expands recurring events and excludes cancelled events outside the range', () => {
    const events = parseIcsEvents(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:weekly\nDTSTART:20260810T090000Z\nDTEND:20260810T100000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Standup\nEND:VEVENT\nBEGIN:VEVENT\nUID:cancelled\nDTSTART:20260810T110000Z\nSTATUS:CANCELLED\nSUMMARY:Nope\nEND:VEVENT\nEND:VCALENDAR`, new Date('2026-08-09T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.startAt.toISOString())).toEqual([
      '2026-08-10T09:00:00.000Z',
      '2026-08-17T09:00:00.000Z',
      '2026-08-24T09:00:00.000Z',
    ]);
    expect(events[0].recurrenceId).toBeTruthy();
  });
});
