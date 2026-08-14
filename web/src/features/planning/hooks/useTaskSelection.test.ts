import { describe, expect, it } from 'vitest';
import { reconcileTaskSelection } from './useTaskSelection';

describe('reconcileTaskSelection', () => {
  it('drops selections that are no longer available while preserving stable state', () => {
    const selected = new Set(['keep', 'remove']);
    const available = new Set(['keep']);
    expect(reconcileTaskSelection(selected, available)).toEqual(new Set(['keep']));
    const stable = new Set(['keep']);
    expect(reconcileTaskSelection(stable, available)).toBe(stable);
  });
});
