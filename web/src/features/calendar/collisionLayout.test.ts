import { describe, expect, it } from 'vitest';
import { calculateDayCollisions } from './collisionLayout';

describe('calculateDayCollisions', () => {
  it('assigns non-overlapping items to Lane 0 in one cluster or separate clusters', () => {
    const items = [
      { id: 'A', startAt: '2026-08-12T09:00:00Z', endAt: '2026-08-12T10:00:00Z' },
      { id: 'B', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T11:00:00Z' },
    ];
    const { placedItems } = calculateDayCollisions(items);

    expect(placedItems.get('A')?.lane).toBe(0);
    expect(placedItems.get('B')?.lane).toBe(0);
    expect(placedItems.get('A')?.laneCount).toBe(1);
    expect(placedItems.get('B')?.laneCount).toBe(1);
  });

  it('assigns overlapping items to separate lanes within the same cluster', () => {
    const items = [
      { id: 'A', startAt: '2026-08-12T09:00:00Z', endAt: '2026-08-12T10:00:00Z' },
      { id: 'B', startAt: '2026-08-12T09:30:00Z', endAt: '2026-08-12T09:45:00Z' },
    ];
    const { placedItems } = calculateDayCollisions(items);

    expect(placedItems.get('A')?.lane).toBe(0);
    expect(placedItems.get('B')?.lane).toBe(1);
    expect(placedItems.get('A')?.laneCount).toBe(2);
    expect(placedItems.get('B')?.laneCount).toBe(2);
  });

  it('treats boundary contact (end === start) as non-overlapping', () => {
    const items = [
      { id: 'A', startAt: '2026-08-12T09:00:00Z', endAt: '2026-08-12T10:00:00Z' },
      { id: 'B', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T11:00:00Z' },
    ];
    const { placedItems } = calculateDayCollisions(items);
    expect(placedItems.get('A')?.lane).toBe(0);
    expect(placedItems.get('B')?.lane).toBe(0);
  });

  it('handles complex overlap structures correctly', () => {
    const items = [
      { id: 'A', startAt: '2026-08-12T09:00:00Z', endAt: '2026-08-12T12:00:00Z' },
      { id: 'B', startAt: '2026-08-12T09:30:00Z', endAt: '2026-08-12T10:00:00Z' },
      { id: 'C', startAt: '2026-08-12T09:45:00Z', endAt: '2026-08-12T11:00:00Z' },
      { id: 'D', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T10:30:00Z' },
    ];
    const { placedItems } = calculateDayCollisions(items);

    expect(placedItems.get('A')?.lane).toBe(0);
    expect(placedItems.get('B')?.lane).toBe(1);
    expect(placedItems.get('C')?.lane).toBe(2);
    // B ends at 10:00, so D starting at 10:00 can reuse Lane 1!
    expect(placedItems.get('D')?.lane).toBe(1);
  });

  it('handles unsorted input deterministically', () => {
    const items = [
      { id: 'B', startAt: '2026-08-12T09:30:00Z', endAt: '2026-08-12T09:45:00Z' },
      { id: 'A', startAt: '2026-08-12T09:00:00Z', endAt: '2026-08-12T10:00:00Z' },
    ];
    const { placedItems } = calculateDayCollisions(items);
    expect(placedItems.get('A')?.lane).toBe(0);
    expect(placedItems.get('B')?.lane).toBe(1);
  });
});
