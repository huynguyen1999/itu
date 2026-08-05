import { describe, expect, it } from 'vitest';
import type { GrowthSkill, GrowthStatistics, StudyCalendarDay } from '@/shared/api/types';
import {
  buildTrendData,
  dateRangeForDays,
  filterActivityRange,
  inclusiveDayCount,
  selectTopAttributes,
  summarizeActivity,
} from './statistics';

function skill(overrides: Partial<GrowthSkill>): GrowthSkill {
  return {
    id: 'skill-1',
    name: 'Strength',
    kind: 'ATTRIBUTE',
    description: '',
    icon: 'star',
    color: '#fff',
    sortOrder: 0,
    starterKey: null,
    cycleId: 'cycle-1',
    archivedAt: null,
    version: 1,
    level: 1,
    currentXp: 0,
    levelStartXp: 0,
    nextLevelXp: 100,
    progressXp: 0,
    requiredXp: 100,
    baseXp: 0,
    ...overrides,
  };
}

describe('statistics helpers', () => {
  it('summarizes the activity fields returned by the calendar', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-28',
        sessions: 1,
        focusSessions: 2,
        reviews: 8,
        correct: 7,
        completedTasks: 2,
        focusedMinutes: 25,
        cardsCreated: 3,
      },
      {
        date: '2026-07-29',
        sessions: 2,
        focusSessions: 3,
        reviews: 12,
        correct: 10,
        completedTasks: 4,
        focusedMinutes: 50,
        cardsCreated: 1,
      },
    ];

    expect(summarizeActivity(days)).toEqual({
      completedTasks: 6,
      focusSessions: 5,
      focusedMinutes: 75,
      reviewSessions: 3,
      reviews: 20,
      cardsCreated: 4,
    });
  });

  it('treats missing activity counts as zero', () => {
    const days = [
      {
        date: '2026-07-29',
        sessions: undefined,
        reviews: 0,
        correct: 0,
        completedTasks: 0,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
    ] as unknown as StudyCalendarDay[];

    expect(summarizeActivity(days)).toMatchObject({
      focusSessions: 0,
      focusedMinutes: 0,
      reviewSessions: 0,
    });
  });

  it('filters activity to an inclusive custom range', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-27',
        sessions: 0,
        focusSessions: 0,
        reviews: 0,
        correct: 0,
        completedTasks: 1,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
      {
        date: '2026-07-28',
        sessions: 0,
        focusSessions: 0,
        reviews: 0,
        correct: 0,
        completedTasks: 2,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
      {
        date: '2026-07-29',
        sessions: 0,
        focusSessions: 0,
        reviews: 0,
        correct: 0,
        completedTasks: 3,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
    ];

    expect(filterActivityRange(days, { from: '2026-07-28', to: '2026-07-29' })).toHaveLength(2);
  });

  it('fills inactive dates and combines activity with XP trends', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-28',
        sessions: 0,
        focusSessions: 1,
        reviews: 0,
        correct: 0,
        completedTasks: 2,
        focusedMinutes: 25,
        cardsCreated: 0,
      },
    ];
    const growth: GrowthStatistics = {
      totalXp: 15,
      trend: [{ date: '2026-07-29', xp: 15 }],
      attributes: [],
    };

    const result = buildTrendData(days, growth, { from: '2026-07-27', to: '2026-07-29' });

    expect(result).toHaveLength(3);
    expect(result.map(({ completedTasks, focusedMinutes, xp }) => ({ completedTasks, focusedMinutes, xp }))).toEqual([
      { completedTasks: 0, focusedMinutes: 0, xp: 0 },
      { completedTasks: 2, focusedMinutes: 25, xp: 0 },
      { completedTasks: 0, focusedMinutes: 0, xp: 15 },
    ]);
  });

  it('creates inclusive rolling ranges', () => {
    const range = dateRangeForDays(30, new Date(2026, 6, 29, 12));
    expect(range).toEqual({ from: '2026-06-30', to: '2026-07-29' });
    expect(inclusiveDayCount(range)).toBe(30);
  });

  it('selects only active user attributes for the leaderboard', () => {
    const result = selectTopAttributes([
      skill({ id: 'general', name: 'General', starterKey: 'attribute-general', level: 99 }),
      skill({ id: 'archived', name: 'Archived', archivedAt: '2026-07-01T00:00:00Z', level: 98 }),
      skill({ id: 'strength', name: 'Strength', level: 3, currentXp: 20 }),
      skill({ id: 'agility', name: 'Agility', level: 3, currentXp: 25 }),
      skill({ id: 'focus', name: 'Focus', kind: 'SKILL', level: 100 }),
    ]);

    expect(result.map(({ id }) => id)).toEqual(['agility', 'strength']);
  });
});
