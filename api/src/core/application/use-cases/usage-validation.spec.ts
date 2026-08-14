import {
  dateKey,
  localDateFor,
  normalizeActivityIconUrl,
  normalizeActivityUrl,
  normalizeHostname,
  normalizeWebsiteUrl,
  parseDate,
  requireTimezone,
  sanitizePageTitle,
} from './usage-validation';

describe('usage validation', () => {
  it('accepts canonical dates and rejects impossible dates', () => {
    expect(dateKey(parseDate('2026-08-14', 'date'))).toBe('2026-08-14');
    expect(() => parseDate('2026-02-30', 'date')).toThrow('date is not a valid date');
  });

  it('normalizes hostnames and strips tracking data from website URLs', () => {
    const hostname = normalizeHostname('DOCS.SWIFT.ORG');
    expect(hostname).toBe('docs.swift.org');
    expect(normalizeWebsiteUrl('https://docs.swift.org/guide?utm=1#top', hostname)).toBe('https://docs.swift.org/guide?utm=1');
    expect(normalizeActivityUrl('https://docs.swift.org/guide?utm=1#top', hostname)).toBe('https://docs.swift.org/guide');
  });

  it('keeps activity metadata bounded and valid', () => {
    expect(normalizeActivityIconUrl('https://cdn.example.com/icon.png?cache=1#icon')).toBe('https://cdn.example.com/icon.png');
    expect(sanitizePageTitle('\u0000 Hello\nWorld ')).toBe('Hello World');
    expect(() => requireTimezone('not/a-timezone')).toThrow('timezone must be a valid IANA timezone');
  });

  it('converts instants to the requested local calendar date', () => {
    expect(localDateFor(new Date('2026-08-10T17:30:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-08-11');
  });
});
