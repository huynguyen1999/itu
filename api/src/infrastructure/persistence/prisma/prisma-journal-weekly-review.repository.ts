import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IJournalWeeklyReviewQuery,
  JournalWeeklyReviewSnapshotData,
} from '@core/application/ports/out/journal-repository.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaJournalWeeklyReviewRepository implements IJournalWeeklyReviewQuery {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshotData(userId: string, periodStart: Date, periodEnd: Date): Promise<JournalWeeklyReviewSnapshotData> {
    const [tasksCompleted, focusStats, habitStats, reviews, expensesRaw, workouts, growthLedgerSum] = await Promise.all([
      this.prisma.task.count({ where: { userId, completedAt: { gte: periodStart, lte: periodEnd } } }),
      this.prisma.focusSession.findMany({
        where: { userId, completedAt: { gte: periodStart, lte: periodEnd } },
        select: { startedAt: true, completedAt: true, adjustedStartedAt: true, adjustedCompletedAt: true, accumulatedPauseSecs: true },
      }),
      this.prisma.habitOccurrence.aggregate({
        where: { habit: { userId }, occurrenceDate: { gte: periodStart, lte: periodEnd } },
        _count: true,
      }),
      this.prisma.reviewLog.count({ where: { userId, createdAt: { gte: periodStart, lte: periodEnd } } }),
      this.prisma.budgetTransaction.findMany({
        where: { userId, transactionAt: { gte: periodStart, lte: periodEnd }, deletedAt: null },
        select: { amount: true, currency: true },
      }),
      this.prisma.gymWorkout.count({ where: { userId, startedAt: { gte: periodStart, lte: periodEnd }, deletedAt: null } }),
      this.prisma.growthLedgerEntry.aggregate({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd }, kind: 'ACTIVITY_AWARD' },
        _sum: { amount: true },
      }),
    ]);

    const habitsCompleted = await this.prisma.habitOccurrence.count({
      where: { habit: { userId }, occurrenceDate: { gte: periodStart, lte: periodEnd }, status: 'COMPLETED' },
    });
    const expenseTotals = new Map<string, Prisma.Decimal>();
    for (const expense of expensesRaw) {
      const current = expenseTotals.get(expense.currency);
      expenseTotals.set(expense.currency, current ? current.add(expense.amount) : expense.amount);
    }

    return {
      tasksCompleted,
      focusActualSeconds: focusStats.reduce((total, session) => {
        const start = session.adjustedStartedAt ?? session.startedAt;
        const end = session.adjustedCompletedAt ?? session.completedAt ?? start;
        return total + Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000) - session.accumulatedPauseSecs);
      }, 0),
      focusSessions: focusStats.length,
      habitsScheduled: habitStats._count ?? 0,
      habitsCompleted,
      reviews,
      expenses: Object.fromEntries([...expenseTotals].map(([currency, amount]) => [currency, amount.toFixed(2)])),
      workouts,
      xpEarned: growthLedgerSum._sum.amount ?? 0,
    };
  }
}
