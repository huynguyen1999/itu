import { Injectable } from '@nestjs/common';
import type { IReviewDataSource, ReviewPeriodData } from '@core/application/ports/out/review-data-source.port';
import type { ReviewPeriod } from '@core/domain/review/review.types';
import { PrismaService } from './prisma.service';

const DAY_MS = 86_400_000;

@Injectable()
export class PrismaReviewDataSource implements IReviewDataSource {
  constructor(private readonly prisma: PrismaService) {}

  async loadPeriodData(userId: string, period: ReviewPeriod, excludeEntryId?: string): Promise<ReviewPeriodData> {
    const start = new Date(period.startInclusive);
    const end = new Date(period.endExclusive);
    const dateStart = new Date(`${period.startDate}T00:00:00Z`);
    const dateEnd = new Date(`${period.endDate}T00:00:00Z`);
    const dateEndExclusive = new Date(dateEnd.getTime() + DAY_MS);

    const [tasks, focusSessions, reviews, habits, journalEntries, workouts, transactions, apps, websites] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { completedAt: { gte: start, lt: end } },
            { scheduledStartAt: { gte: start, lt: end } },
            { scheduledEndAt: { gte: start, lt: end } },
            { dueAt: { gte: start, lt: end } },
            { status: 'CANCELED', updatedAt: { gte: start, lt: end } },
          ],
        },
        select: {
          title: true,
          priority: true,
          important: true,
          estimatedMinutes: true,
          status: true,
          completedAt: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          dueAt: true,
        },
      }),
      this.prisma.focusSession.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
        include: { interruptions: true },
      }),
      this.prisma.reviewLog.findMany({
        where: { userId, createdAt: { gte: start, lt: end } },
        select: { grade: true, cardPromptRichText: true, cardDeckId: true, createdAt: true },
      }),
      this.prisma.habitOccurrence.findMany({
        where: { habit: { userId }, occurrenceDate: { gte: dateStart, lt: dateEndExclusive } },
        include: { habit: { select: { name: true, targetValue: true } } },
      }),
      this.prisma.journalEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          entryDate: { gte: dateStart, lt: dateEndExclusive },
          ...(excludeEntryId ? { NOT: { id: excludeEntryId } } : {}),
        },
        select: {
          id: true,
          entryDate: true,
          title: true,
          contentMarkdown: true,
          kind: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
        orderBy: { entryDate: 'asc' },
      }),
      this.prisma.gymWorkout.findMany({
        where: { userId, status: 'COMPLETED', deletedAt: null, startedAt: { gte: start, lt: end } },
        include: { exercises: { where: { deletedAt: null }, include: { sets: { where: { deletedAt: null } } } } },
      }),
      this.prisma.expense.findMany({
        where: { userId, deletedAt: null, expenseDate: { gte: start, lt: end } },
        include: { category: { select: { name: true } } },
      }),
      this.prisma.usageSummary.findMany({
        where: { userId, localDate: { gte: dateStart, lt: dateEndExclusive } },
        select: { localDate: true, bundleId: true, displayName: true, activeSeconds: true, engagedSeconds: true },
      }),
      this.prisma.websiteActivitySession.findMany({
        where: { userId, isPrivate: false, startedAt: { gte: start, lt: end } },
        select: { startedAt: true, hostname: true, pageTitle: true, activeSeconds: true },
      }),
    ]);

    const completedTasks = tasks.filter((task) => task.completedAt !== null);
    const scheduledTasks = tasks.filter((task) => task.scheduledStartAt || task.scheduledEndAt || task.dueAt);
    const focus = focusSessions.map((session) => {
      const startedAt = session.adjustedStartedAt ?? session.startedAt;
      const completedAt = session.adjustedCompletedAt ?? session.completedAt ?? startedAt;
      return {
        title: session.customTitle || session.taskTitleSnapshot || session.taskListTitleSnapshot || 'Focus session',
        minutes: Math.round(Math.max(0, (completedAt.getTime() - startedAt.getTime()) / 1000 - session.accumulatedPauseSecs) / 60),
        interruptions: session.interruptions.length,
        reflection: session.reflection,
      };
    });
    const focusMinutes = focus.reduce((sum, session) => sum + session.minutes, 0);
    const grades = Object.fromEntries(['AGAIN', 'HARD', 'GOOD', 'EASY'].map((grade) => [grade, reviews.filter((review) => review.grade === grade).length]));
    const habitCounts = countBy(habits, (habit) => habit.status);
    const habitScheduled = habits.length;
    const habitCompleted = habitCounts.COMPLETED ?? 0;
    const transactionTotals = new Map<string, number>();
    const categoryTotals = new Map<string, number>();
    for (const transaction of transactions) {
      const amount = Number(transaction.amount);
      transactionTotals.set('VND', (transactionTotals.get('VND') ?? 0) + amount);
      const category = transaction.category.name;
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);
    }
    const workoutSets = workouts.reduce(
      (sum, workout) =>
        sum +
        workout.exercises.reduce(
          (exerciseSum, exercise) =>
            exerciseSum +
            exercise.sets.filter((set) => set.completedAt && set.type !== 'WARM_UP' && set.type !== 'WARMUP').length,
          0,
        ),
      0,
    );
    const appTotals = new Map<string, { displayName: string; activeSeconds: number; engagedSeconds: number }>();
    for (const app of apps) {
      const current = appTotals.get(app.bundleId) ?? { displayName: app.displayName, activeSeconds: 0, engagedSeconds: 0 };
      current.activeSeconds += app.activeSeconds;
      current.engagedSeconds += app.engagedSeconds ?? 0;
      appTotals.set(app.bundleId, current);
    }
    const websiteTotals = new Map<string, { activeSeconds: number; pageTitles: string[] }>();
    for (const session of websites) {
      const current = websiteTotals.get(session.hostname) ?? { activeSeconds: 0, pageTitles: [] };
      current.activeSeconds += session.activeSeconds;
      if (session.pageTitle && current.pageTitles.length < 3) current.pageTitles.push(session.pageTitle);
      websiteTotals.set(session.hostname, current);
    }

    const metrics = {
      tasks: {
        completed: completedTasks.length,
        importantCompleted: completedTasks.filter((task) => task.important).length,
        scheduled: scheduledTasks.length,
        unfinishedScheduled: scheduledTasks.filter((task) => task.completedAt === null).length,
        canceled: tasks.filter((task) => task.status === 'CANCELED').length,
      },
      focus: {
        minutes: focusMinutes,
        sessions: focus.length,
        abandonedSessions: await this.prisma.focusSession.count({ where: { userId, status: 'ABANDONED', completedAt: null, updatedAt: { gte: start, lt: end } } }),
        interruptions: focus.reduce((sum, session) => sum + session.interruptions, 0),
        averageMinutes: focus.length ? Math.round(focusMinutes / focus.length) : 0,
      },
      learning: { reviews: reviews.length, grades, accuracy: reviews.length ? reviews.filter((review) => review.grade === 'GOOD' || review.grade === 'EASY').length / reviews.length : null },
      habits: { scheduled: habitScheduled, completed: habitCompleted, failed: habitCounts.FAILED ?? 0, skipped: habitCounts.SKIPPED ?? 0, completionRate: habitScheduled ? habitCompleted / habitScheduled : 0 },
      journal: { entries: journalEntries.length },
      gym: { workouts: workouts.length, sets: workoutSets, minutes: workouts.reduce((sum, workout) => sum + (workout.durationMinutes ?? 0), 0) },
      budget: { spendingByCurrency: Object.fromEntries(transactionTotals), spendingByCategory: Object.fromEntries(categoryTotals) },
      appUsage: { activeSeconds: apps.reduce((sum, app) => sum + app.activeSeconds, 0), engagedSeconds: apps.reduce((sum, app) => sum + (app.engagedSeconds ?? 0), 0) },
      websiteUsage: { activeSeconds: websites.reduce((sum, session) => sum + session.activeSeconds, 0) },
    };

    return {
      period,
      coverage: {
        tasks: coverage(tasks.map((task) => task.completedAt ?? task.scheduledStartAt ?? task.scheduledEndAt ?? task.dueAt), period),
        focus: coverage(focusSessions.map((session) => session.completedAt), period),
        learning: coverage(reviews.map((review) => review.createdAt), period),
        habits: coverage(habits.map((habit) => habit.occurrenceDate), period),
        journal: coverage(journalEntries.map((entry) => entry.entryDate), period),
        gym: coverage(workouts.map((workout) => workout.startedAt), period),
        budget: coverage(transactions.map((transaction) => transaction.expenseDate), period),
        appUsage: usageCoverage(apps.map((app) => app.localDate), period),
        websiteUsage: coverage(websites.map((session) => session.startedAt), period),
      },
      metrics,
      details: {
        tasks: completedTasks.slice(0, 30).map((task) => ({ title: task.title, priority: task.priority, important: task.important, estimatedMinutes: task.estimatedMinutes })),
        unfinishedTasks: scheduledTasks.filter((task) => task.completedAt === null).slice(0, 20).map((task) => ({ title: task.title, priority: task.priority, dueAt: task.dueAt, estimatedMinutes: task.estimatedMinutes })),
        focus: focus.slice(0, 30),
        learning: { gradeDistribution: grades, examples: reviews.slice(0, 8).map((review) => ({ prompt: review.cardPromptRichText, grade: review.grade })) },
        habits: Object.entries(groupHabitDetails(habits)).map(([name, value]) => ({ name, ...value })),
        journal: journalContext(journalEntries),
        gym: workouts.slice(0, 20).map((workout) => ({ title: workout.title, durationMinutes: workout.durationMinutes, exercises: workout.exercises.map((exercise) => ({ name: exercise.exerciseName, sets: exercise.sets.filter((set) => set.completedAt).length })) })),
        budget: { topTransactions: transactions.sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5).map((transaction) => ({ amount: String(transaction.amount), currency: 'VND', category: transaction.category.name, merchant: transaction.merchant, note: transaction.note })) },
        appUsage: [...appTotals.entries()].sort((a, b) => b[1].activeSeconds - a[1].activeSeconds).slice(0, 10).map(([bundleId, value]) => ({ bundleId, ...value })),
        websiteUsage: [...websiteTotals.entries()].sort((a, b) => b[1].activeSeconds - a[1].activeSeconds).slice(0, 10).map(([hostname, value]) => ({ hostname, ...value })),
      },
    };
  }
}

function coverage(dates: Array<Date | null>, period: ReviewPeriod) {
  const expectedDays = dateDistance(period.startDate, period.endDate) + 1;
  const coveredDays = new Set(dates.filter((date): date is Date => date instanceof Date).map((date) => date.toISOString().slice(0, 10))).size;
  return { available: coveredDays > 0, coveredDays, expectedDays };
}

function usageCoverage(dates: Date[], period: ReviewPeriod) {
  const expectedDays = dateDistance(period.startDate, period.endDate) + 1;
  const covered = new Set(dates.map((date) => date.toISOString().slice(0, 10))).size;
  return { available: covered > 0, coveredDays: covered, expectedDays };
}

function dateDistance(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

function countBy<T>(values: T[], key: (value: T) => string) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const name = key(value);
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
}

function groupHabitDetails(habits: Array<{ status: string; habit: { name: string; targetValue: number } }>) {
  return habits.reduce<Record<string, { scheduled: number; completed: number; failed: number; skipped: number }>>((result, occurrence) => {
    const current = result[occurrence.habit.name] ?? { scheduled: 0, completed: 0, failed: 0, skipped: 0 };
    current.scheduled += 1;
    if (occurrence.status === 'COMPLETED') current.completed += 1;
    if (occurrence.status === 'FAILED') current.failed += 1;
    if (occurrence.status === 'SKIPPED') current.skipped += 1;
    result[occurrence.habit.name] = current;
    return result;
  }, {});
}

function journalContext(entries: Array<{
  entryDate: Date;
  title: string;
  contentMarkdown: string;
  kind: string;
  tags: Array<{ tag: { name: string } }>;
}>) {
  const totalEntries = entries.length;
  const maxCharacters = 40_000;
  let usedCharacters = 0;
  const includedEntries = entries.filter((entry) => {
    const size = entry.title.length + entry.contentMarkdown.length;
    if (usedCharacters + size > maxCharacters) return false;
    usedCharacters += size;
    return true;
  });
  return {
    truncated: includedEntries.length !== totalEntries,
    includedEntries: includedEntries.length,
    totalEntries,
    entries: includedEntries.map((entry) => ({
      date: entry.entryDate,
      title: entry.title,
      tags: entry.tags.map(({ tag }) => tag.name),
      contentMarkdown: entry.contentMarkdown,
      kind: entry.kind,
    })),
  };
}
