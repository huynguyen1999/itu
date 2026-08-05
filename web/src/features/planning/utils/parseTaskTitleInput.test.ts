import { describe, expect, it } from 'vitest';
import { parseTaskTitleInput } from './parseTaskTitleInput';

describe('parseTaskTitleInput', () => {
  it('returns clean title unchanged when no shortcuts present', () => {
    const result = parseTaskTitleInput('  Buy groceries  ');
    expect(result.cleanTitle).toBe('Buy groceries');
    expect(result.priority).toBeUndefined();
    expect(result.dueAtDateString).toBeUndefined();
  });

  it('parses priority shortcuts correctly', () => {
    expect(parseTaskTitleInput('Fix bug !high').priority).toBe('HIGH');
    expect(parseTaskTitleInput('Fix bug !high').cleanTitle).toBe('Fix bug');
    expect(parseTaskTitleInput('Fix bug !p1').priority).toBe('HIGH');

    expect(parseTaskTitleInput('Review PR !med').priority).toBe('MEDIUM');
    expect(parseTaskTitleInput('Review PR !p2').priority).toBe('MEDIUM');

    expect(parseTaskTitleInput('Water plants !low').priority).toBe('LOW');
    expect(parseTaskTitleInput('Water plants !p3').priority).toBe('LOW');
  });

  it('parses due date shortcuts correctly', () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const resToday = parseTaskTitleInput('Submit report #today');
    expect(resToday.cleanTitle).toBe('Submit report');
    expect(resToday.dueAtDateString).toBe(todayStr);

    const resTomorrow = parseTaskTitleInput('Call client due:tomorrow');
    expect(resTomorrow.cleanTitle).toBe('Call client');
    expect(resTomorrow.dueAtDateString).toBe(tomorrowStr);
  });
});
