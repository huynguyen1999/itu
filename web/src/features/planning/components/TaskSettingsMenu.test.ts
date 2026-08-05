import { describe, expect, it } from 'vitest';
import { priorityFlagColor } from './TaskSettingsMenu';

describe('task settings priority colors', () => {
  it('keeps a distinct color for each meaningful priority', () => {
    expect(priorityFlagColor('HIGH')).toContain('rose');
    expect(priorityFlagColor('MEDIUM')).toContain('amber');
    expect(priorityFlagColor('LOW')).toContain('blue');
    expect(priorityFlagColor('NONE')).toBe('');
  });
});
