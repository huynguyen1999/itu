import { GrowthCurrency, GrowthProgressKind } from '@prisma/client';
import { PrismaGrowthRepository } from './prisma-growth.repository';
import { PrismaStudySessionRepository } from './prisma-study.repository';

describe('statistics repositories', () => {
  it('counts completed focus sessions in the daily activity calendar', async () => {
    const repository = new PrismaStudySessionRepository({
      studySession: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      focusSession: {
        findMany: jest.fn().mockResolvedValue([
          {
            startedAt: new Date('2026-07-29T09:00:00.000Z'),
            completedAt: new Date('2026-07-29T09:30:00.000Z'),
            adjustedStartedAt: null,
            adjustedCompletedAt: null,
            accumulatedPauseSecs: 300,
          },
        ]),
      },
      card: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    const result = await repository.studyCalendar(
      'user-1',
      new Date('2026-07-29T00:00:00.000Z'),
      new Date('2026-07-30T00:00:00.000Z'),
    );

    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-07-29',
        focusSessions: 1,
        focusedMinutes: 25,
      }),
    ]);
  });

  it('aggregates earned XP and attribute gains, losses, and net change', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        amount: 20,
        createdAt: new Date('2026-07-28T10:00:00.000Z'),
        skillId: 'attribute-1',
        skill: { name: 'Intelligence', kind: GrowthProgressKind.ATTRIBUTE, icon: 'BRAIN', color: 'BLUE' },
      },
      {
        amount: -5,
        createdAt: new Date('2026-07-28T11:00:00.000Z'),
        skillId: 'attribute-1',
        skill: { name: 'Intelligence', kind: GrowthProgressKind.ATTRIBUTE, icon: 'BRAIN', color: 'BLUE' },
      },
      {
        amount: 10,
        createdAt: new Date('2026-07-29T10:00:00.000Z'),
        skillId: 'skill-1',
        skill: { name: 'Programming', kind: GrowthProgressKind.SKILL, icon: 'CODE', color: 'TEAL' },
      },
    ]);
    const repository = new PrismaGrowthRepository(
      { growthLedgerEntry: { findMany } } as never,
      {} as never,
    );

    const result = await repository.growthStatistics(
      'user-1',
      new Date('2026-07-28T00:00:00.000Z'),
      new Date('2026-07-30T00:00:00.000Z'),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ currency: GrowthCurrency.SKILL_XP }),
    }));
    expect(result).toEqual({
      totalXp: 30,
      trend: [
        { date: '2026-07-28', xp: 20 },
        { date: '2026-07-29', xp: 10 },
      ],
      attributes: [
        {
          skillId: 'attribute-1',
          name: 'Intelligence',
          icon: 'BRAIN',
          color: 'BLUE',
          gained: 20,
          lost: 5,
          net: 15,
          changes: 2,
        },
      ],
    });
  });
});
