import { describe, expect, it } from 'vitest';
import type { GrowthSkill, StudyCalendarDay } from '@/shared/api/types';
import {
  attributeRadarData,
  formatFocusDuration,
  growthAttributeItems,
  growthProfileItems,
  profileRadarCeiling,
  profileRadarValue,
  parseHomeProfileSelection,
  resolveHomeProfileSelection,
  summarizeTodayActivity,
  toggleHomeProfileItem,
  xpProgress,
} from './dashboard';

describe('dashboard helpers', () => {
  it('summarizes focus and reviews from the requested calendar window', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-29',
        sessions: 2,
        focusSessions: 1,
        reviews: 14,
        correct: 12,
        completedTasks: 3,
        focusedMinutes: 75,
        cardsCreated: 1,
      },
    ];

    expect(summarizeTodayActivity(days)).toEqual({ focusedMinutes: 75, reviewedCards: 14, completedTasks: 3 });
  });

  it('keeps active attributes in their configured order', () => {
    const skill = (overrides: Partial<GrowthSkill>): GrowthSkill => ({
      id: 'attribute',
      name: 'General',
      kind: 'ATTRIBUTE',
      description: '',
      icon: 'SPARKLES',
      color: 'TEAL',
      sortOrder: 0,
      baseXp: 100,
      level: 1,
      currentXp: 0,
      levelStartXp: 0,
      nextLevelXp: 100,
      progressXp: 0,
      requiredXp: 100,
      version: 1,
      ...overrides,
    });

    expect(
      attributeRadarData([
        skill({ id: 'strength', name: 'Strength', sortOrder: 2 }),
        skill({ id: 'general', name: 'General', sortOrder: 1 }),
        skill({ id: 'archived', name: 'Archived', archivedAt: '2026-07-29T00:00:00.000Z' }),
        skill({ id: 'writing', name: 'Writing', kind: 'SKILL' }),
      ]).map(({ name }) => name),
    ).toEqual(['Strength']);
  });

  it('clamps XP progress and formats focus duration', () => {
    expect(xpProgress(75, 100)).toBe(75);
    expect(xpProgress(120, 100)).toBe(100);
    expect(formatFocusDuration(45)).toBe('45m');
    expect(formatFocusDuration(90)).toBe('1h 30m');
  });

  it('builds the selectable profile from active attributes and skills', () => {
    const skill = (overrides: Partial<GrowthSkill>): GrowthSkill => ({
      id: 'entry',
      name: 'Entry',
      kind: 'ATTRIBUTE',
      description: '',
      icon: 'SPARKLES',
      color: 'TEAL',
      sortOrder: 0,
      baseXp: 100,
      level: 1,
      currentXp: 0,
      levelStartXp: 0,
      nextLevelXp: 100,
      progressXp: 0,
      requiredXp: 100,
      version: 1,
      ...overrides,
    });

    expect(
      growthProfileItems([
        skill({ id: 'skill', name: 'Writing', kind: 'SKILL', sortOrder: 0 }),
        skill({ id: 'second', name: 'Strength', sortOrder: 2 }),
        skill({ id: 'first', name: 'General', sortOrder: 1 }),
        skill({ id: 'archived', name: 'Archived', archivedAt: '2026-07-29T00:00:00.000Z' }),
      ]).map(({ id }) => id),
    ).toEqual(['second', 'skill']);
  });

  it('builds the profile from active attributes only', () => {
    const skill = (overrides: Partial<GrowthSkill>): GrowthSkill => ({
      id: 'entry',
      name: 'Entry',
      kind: 'ATTRIBUTE',
      description: '',
      icon: 'SPARKLES',
      color: 'TEAL',
      sortOrder: 0,
      baseXp: 100,
      level: 1,
      currentXp: 0,
      levelStartXp: 0,
      nextLevelXp: 100,
      progressXp: 0,
      requiredXp: 100,
      version: 1,
      ...overrides,
    });

    expect(
      growthAttributeItems([
        skill({ id: 'skill', name: 'Writing', kind: 'SKILL', sortOrder: 0 }),
        skill({ id: 'attribute', name: 'Strength', sortOrder: 1 }),
        skill({ id: 'archived', name: 'Archived', archivedAt: '2026-07-29T00:00:00.000Z' }),
      ]).map(({ id }) => id),
    ).toEqual(['attribute']);
  });

  it('uses experience for radar values while labels retain level', () => {
    const skill = (overrides: Partial<GrowthSkill>): GrowthSkill => ({
      id: 'attribute',
      name: 'General',
      kind: 'ATTRIBUTE',
      description: '',
      icon: 'SPARKLES',
      color: 'TEAL',
      sortOrder: 0,
      baseXp: 100,
      level: 1,
      currentXp: 0,
      levelStartXp: 0,
      nextLevelXp: 100,
      progressXp: 0,
      requiredXp: 100,
      version: 1,
      ...overrides,
    });

    expect(profileRadarValue(skill({ level: 1, currentXp: 0 }))).toBe(0);
    expect(profileRadarValue(skill({ level: 2, currentXp: 100 }))).toBe(100);
    expect(profileRadarValue(skill({ level: 2, currentXp: 150 }))).toBe(150);
    expect(profileRadarCeiling([skill({ currentXp: 100 }), skill({ currentXp: 150 })])).toBe(165);
  });

  it('persists unique profile choices and enforces the eight-item limit', () => {
    expect(parseHomeProfileSelection(null)).toBeNull();
    expect(parseHomeProfileSelection('not-json')).toBeNull();
    expect(parseHomeProfileSelection(JSON.stringify(['one', 'one', 'two']))).toEqual(['one', 'two']);

    const fullSelection = Array.from({ length: 8 }, (_, index) => String(index));
    expect(toggleHomeProfileItem(fullSelection, 'ninth')).toEqual(fullSelection);
    expect(toggleHomeProfileItem(fullSelection, '3')).not.toContain('3');
    expect(toggleHomeProfileItem(['one'], 'two')).toEqual(['one', 'two']);
  });

  it('recovers the default profile when every saved item is stale', () => {
    const availableIds = ['general', 'strength', 'intelligence', 'dexterity'];

    expect(resolveHomeProfileSelection(null, availableIds)).toEqual(availableIds);
    expect(resolveHomeProfileSelection(['old-general', 'old-strength'], availableIds)).toEqual(availableIds);
    expect(resolveHomeProfileSelection(['strength', 'old-general'], availableIds)).toEqual(['strength']);
    expect(resolveHomeProfileSelection([], availableIds)).toEqual([]);
  });
});
