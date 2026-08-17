import { Injectable } from '@nestjs/common';
import type { IReviewDataSource, ReviewPeriodData } from '@core/application/ports/out/review-data-source.port';
import type { ReviewPeriod } from '@core/domain/review/review.types';
import { PrismaService } from './prisma.service';

const DAY_MS = 86_400_000;

type UsageRow = {
  localDate: Date;
  syncDeviceId: string;
  source: string;
  hour: number;
  bundleId: string;
  displayName: string;
  activeSeconds: number;
  engagedSeconds: number | null;
  pickups: number | null;
  notifications: number | null;
};
type UsageCounters = {
  activeSeconds: number;
  engagedSeconds: number | null;
  pickups: number | null;
  notifications: number | null;
};
type WebsiteSummaryRow = {
  localDate: Date;
  syncDeviceId: string;
  source: string;
  hour: number;
  browserBundleId: string | null;
  hostname: string;
  urlKey: string;
  activeSeconds: number;
};
type WebsiteSessionRow = { installationId: string; startedAt: Date } & Omit<WebsiteReviewRow, 'source' | 'localDate'>;
type WebsiteReviewRow = {
  source: string;
  localDate: string;
  hostname: string;
  pageTitle?: string | null;
  activeSeconds: number;
};
type HealthSummaryRow = {
  localDate: Date;
  syncDeviceId: string;
  updatedAt: Date;
  steps: number;
  walkingRunningDistanceMeters: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standHours: number | null;
  sleepMinutes: number | null;
  restingHeartRateBpm: number | null;
  hrvMilliseconds: number | null;
  workoutCount: number;
  workoutMinutes: number;
  workoutEnergyKcal: number;
};
type HealthWorkoutRow = { healthKitUUID: string; startedAt: Date };

@Injectable()
export class PrismaReviewDataSource implements IReviewDataSource {
  constructor(private readonly prisma: PrismaService) {}

  async loadPeriodData(userId: string, period: ReviewPeriod, excludeEntryId?: string): Promise<ReviewPeriodData> {
    const start = new Date(period.startInclusive);
    const end = new Date(period.endExclusive);
    const dateStart = new Date(`${period.startDate}T00:00:00Z`);
    const dateEnd = new Date(`${period.endDate}T00:00:00Z`);
    const dateEndExclusive = new Date(dateEnd.getTime() + DAY_MS);

    const [
      tasks,
      focusSessions,
      reviews,
      habits,
      journalEntries,
      workouts,
      transactions,
      apps,
      websiteSessions,
      websiteSummaries,
      healthSummaries,
      healthWorkouts,
    ] = await Promise.all([
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
        where: { userId, deletedAt: null, expenseDate: { gte: dateStart, lt: dateEndExclusive } },
        include: { category: { select: { name: true } } },
      }),
      this.prisma.usageSummary.findMany({
        where: { userId, localDate: { gte: dateStart, lt: dateEndExclusive } },
        select: {
          localDate: true,
          syncDeviceId: true,
          source: true,
          hour: true,
          bundleId: true,
          displayName: true,
          activeSeconds: true,
          engagedSeconds: true,
          pickups: true,
          notifications: true,
        },
      }),
      this.prisma.websiteActivitySession.findMany({
        where: { userId, isPrivate: false, startedAt: { gte: start, lt: end } },
        select: { installationId: true, startedAt: true, hostname: true, pageTitle: true, activeSeconds: true },
      }),
      this.prisma.websiteUsageSummary.findMany({
        where: { userId, localDate: { gte: dateStart, lt: dateEndExclusive } },
        select: {
          localDate: true,
          syncDeviceId: true,
          source: true,
          hour: true,
          browserBundleId: true,
          hostname: true,
          urlKey: true,
          activeSeconds: true,
        },
      }),
      this.prisma.healthSummary.findMany({
        where: { userId, source: 'HEALTH_KIT', localDate: { gte: dateStart, lt: dateEndExclusive } },
        select: {
          localDate: true,
          syncDeviceId: true,
          updatedAt: true,
          steps: true,
          walkingRunningDistanceMeters: true,
          activeEnergyKcal: true,
          exerciseMinutes: true,
          standHours: true,
          sleepMinutes: true,
          restingHeartRateBpm: true,
          hrvMilliseconds: true,
          workoutCount: true,
          workoutMinutes: true,
          workoutEnergyKcal: true,
        },
        orderBy: [{ localDate: 'asc' }, { updatedAt: 'desc' }, { syncDeviceId: 'asc' }],
      }),
      this.prisma.healthWorkout.findMany({
        where: { userId, source: 'HEALTH_KIT', startedAt: { gte: start, lt: end } },
        select: {
          healthKitUUID: true,
          startedAt: true,
        },
      }),
    ]);

    const completedTasks = tasks.filter((task) => task.completedAt !== null);
    const scheduledTasks = tasks.filter((task) => task.scheduledStartAt || task.scheduledEndAt || task.dueAt);
    const focus = focusSessions.map((session) => {
      const startedAt = session.adjustedStartedAt ?? session.startedAt;
      const completedAt = session.adjustedCompletedAt ?? session.completedAt ?? startedAt;
      return {
        title: session.customTitle || session.taskTitleSnapshot || session.taskListTitleSnapshot || 'Focus session',
        minutes: Math.round(
          Math.max(0, (completedAt.getTime() - startedAt.getTime()) / 1000 - session.accumulatedPauseSecs) / 60,
        ),
        interruptions: session.interruptions.length,
        reflection: session.reflection,
      };
    });
    const focusMinutes = focus.reduce((sum, session) => sum + session.minutes, 0);
    const grades = Object.fromEntries(
      ['AGAIN', 'HARD', 'GOOD', 'EASY'].map((grade) => [
        grade,
        reviews.filter((review) => review.grade === grade).length,
      ]),
    );
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
    const distinctApps = distinctUsageRows(apps as UsageRow[]);
    const appUsageTotals = usageCounters(distinctApps);
    const appSourceTotals = sourceTotals(distinctApps);
    const appTotals = new Map<string, { displayName: string } & UsageCounters>();
    for (const app of distinctApps) {
      const current = appTotals.get(app.bundleId) ?? { displayName: app.displayName, ...emptyUsageCounters() };
      addUsageRow(current, app);
      appTotals.set(app.bundleId, current);
    }

    const websites = selectWebsiteRows(
      websiteSummaries as WebsiteSummaryRow[],
      websiteSessions as WebsiteSessionRow[],
      period.timezone,
    );
    const websiteTotals = new Map<string, { activeSeconds: number; pageTitles: string[] }>();
    for (const session of websites) {
      const current = websiteTotals.get(session.hostname) ?? { activeSeconds: 0, pageTitles: [] };
      current.activeSeconds += session.activeSeconds;
      if (session.pageTitle && current.pageTitles.length < 3) current.pageTitles.push(session.pageTitle);
      websiteTotals.set(session.hostname, current);
    }
    const websiteSourceTotals = sourceWebsiteTotals(websites);

    const distinctHealthWorkouts = distinctHealthWorkoutRows(healthWorkouts as HealthWorkoutRow[]);
    const canonicalHealthSummaries = canonicalHealthRows(healthSummaries as HealthSummaryRow[]);
    const healthMetrics = aggregateHealth(canonicalHealthSummaries, distinctHealthWorkouts.length);

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
        abandonedSessions: await this.prisma.focusSession.count({
          where: { userId, status: 'ABANDONED', completedAt: null, updatedAt: { gte: start, lt: end } },
        }),
        interruptions: focus.reduce((sum, session) => sum + session.interruptions, 0),
        averageMinutes: focus.length ? Math.round(focusMinutes / focus.length) : 0,
      },
      learning: {
        reviews: reviews.length,
        grades,
        accuracy: reviews.length
          ? reviews.filter((review) => review.grade === 'GOOD' || review.grade === 'EASY').length / reviews.length
          : null,
      },
      habits: {
        scheduled: habitScheduled,
        completed: habitCompleted,
        failed: habitCounts.FAILED ?? 0,
        skipped: habitCounts.SKIPPED ?? 0,
        completionRate: habitScheduled ? habitCompleted / habitScheduled : 0,
      },
      journal: { entries: journalEntries.length },
      gym: {
        workouts: workouts.length,
        sets: workoutSets,
        minutes: workouts.reduce((sum, workout) => sum + (workout.durationMinutes ?? 0), 0),
      },
      budget: {
        spendingByCurrency: Object.fromEntries(transactionTotals),
        spendingByCategory: Object.fromEntries(categoryTotals),
      },
      appUsage: { ...appUsageTotals, sourceTotals: appSourceTotals },
      websiteUsage: {
        activeSeconds: websites.reduce((sum, session) => sum + session.activeSeconds, 0),
        sourceTotals: websiteSourceTotals,
      },
      health: healthMetrics,
    };

    return {
      period,
      coverage: {
        tasks: coverage(
          tasks.map((task) => task.completedAt ?? task.scheduledStartAt ?? task.scheduledEndAt ?? task.dueAt),
          period,
        ),
        focus: coverage(
          focusSessions.map((session) => session.completedAt),
          period,
        ),
        learning: coverage(
          reviews.map((review) => review.createdAt),
          period,
        ),
        habits: dateOnlyCoverage(
          habits.map((habit) => dateKey(habit.occurrenceDate)),
          period,
        ),
        journal: dateOnlyCoverage(
          journalEntries.map((entry) => dateKey(entry.entryDate)),
          period,
        ),
        gym: coverage(
          workouts.map((workout) => workout.startedAt),
          period,
        ),
        budget: dateOnlyCoverage(
          transactions.map((transaction) => dateKey(transaction.expenseDate)),
          period,
        ),
        appUsage: dateOnlyCoverage(
          distinctApps.map((app) => dateKey(app.localDate)),
          period,
        ),
        websiteUsage: dateOnlyCoverage(
          websites.map((website) => website.localDate),
          period,
        ),
        health: dateOnlyCoverage(
          [
            ...canonicalHealthSummaries.map((summary) => dateKey(summary.localDate)),
            ...distinctHealthWorkouts.map((workout) => localDateKey(workout.startedAt, period.timezone)),
          ],
          period,
        ),
      },
      metrics,
      details: {
        tasks: completedTasks.slice(0, 30).map((task) => ({
          title: task.title,
          priority: task.priority,
          important: task.important,
          estimatedMinutes: task.estimatedMinutes,
        })),
        unfinishedTasks: scheduledTasks
          .filter((task) => task.completedAt === null)
          .slice(0, 20)
          .map((task) => ({
            title: task.title,
            priority: task.priority,
            dueAt: task.dueAt,
            estimatedMinutes: task.estimatedMinutes,
          })),
        focus: focus.slice(0, 30),
        learning: {
          gradeDistribution: grades,
          examples: reviews.slice(0, 8).map((review) => ({ prompt: review.cardPromptRichText, grade: review.grade })),
        },
        habits: Object.entries(groupHabitDetails(habits)).map(([name, value]) => ({ name, ...value })),
        journal: journalContext(journalEntries),
        gym: workouts.slice(0, 20).map((workout) => ({
          title: workout.title,
          durationMinutes: workout.durationMinutes,
          exercises: workout.exercises.map((exercise) => ({
            name: exercise.exerciseName,
            sets: exercise.sets.filter((set) => set.completedAt).length,
          })),
        })),
        budget: {
          topTransactions: transactions
            .sort((a, b) => Number(b.amount) - Number(a.amount))
            .slice(0, 5)
            .map((transaction) => ({
              amount: String(transaction.amount),
              currency: 'VND',
              category: transaction.category.name,
              merchant: transaction.merchant,
              note: transaction.note,
            })),
        },
        appUsage: [...appTotals.entries()]
          .sort((a, b) => b[1].activeSeconds - a[1].activeSeconds)
          .slice(0, 10)
          .map(([bundleId, value]) => ({ bundleId, ...value })),
        websiteUsage: [...websiteTotals.entries()]
          .sort((a, b) => b[1].activeSeconds - a[1].activeSeconds)
          .slice(0, 10)
          .map(([hostname, value]) => ({ hostname, ...value })),
      },
    };
  }
}

function coverage(dates: Array<Date | null>, period: ReviewPeriod) {
  const expectedDays = dateDistance(period.startDate, period.endDate) + 1;
  const coveredDays = new Set(
    dates
      .filter((date): date is Date => date instanceof Date)
      .map((date) => localDateKey(date, period.timezone))
      .filter((date) => date >= period.startDate && date <= period.endDate),
  ).size;
  return { available: coveredDays > 0, coveredDays, expectedDays };
}

function dateOnlyCoverage(dates: string[], period: ReviewPeriod) {
  const expectedDays = dateDistance(period.startDate, period.endDate) + 1;
  const covered = new Set(dates.filter((date) => date >= period.startDate && date <= period.endDate)).size;
  return { available: covered > 0, coveredDays: covered, expectedDays };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function localDateKey(date: Date, timezone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function emptyUsageCounters(): UsageCounters {
  return { activeSeconds: 0, engagedSeconds: null, pickups: null, notifications: null };
}

function addUsageRow(
  target: UsageCounters,
  row: Pick<UsageRow, 'activeSeconds' | 'engagedSeconds' | 'pickups' | 'notifications'>,
) {
  target.activeSeconds += row.activeSeconds;
  for (const field of ['engagedSeconds', 'pickups', 'notifications'] as const) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    target[field] = (target[field] ?? 0) + value;
  }
}

function usageCounters(rows: UsageRow[]): UsageCounters {
  const result = emptyUsageCounters();
  for (const row of rows) addUsageRow(result, row);
  return result;
}

function distinctUsageRows(rows: UsageRow[]): UsageRow[] {
  const distinct = new Map<string, UsageRow>();
  for (const row of rows) {
    distinct.set(
      `${row.source}\u0000${row.syncDeviceId}\u0000${dateKey(row.localDate)}\u0000${row.hour}\u0000${row.bundleId}`,
      row,
    );
  }
  return [...distinct.values()];
}

function sourceTotals(rows: UsageRow[]) {
  const totals = new Map<string, UsageCounters>();
  for (const row of rows) {
    const current = totals.get(row.source) ?? emptyUsageCounters();
    addUsageRow(current, row);
    totals.set(row.source, current);
  }
  return Object.fromEntries(totals);
}

function selectWebsiteRows(
  summaries: WebsiteSummaryRow[],
  sessions: WebsiteSessionRow[],
  timezone: string,
): WebsiteReviewRow[] {
  const distinct = new Map<string, WebsiteSummaryRow>();
  for (const summary of summaries) {
    distinct.set(
      `${summary.source}\u0000${summary.syncDeviceId}\u0000${dateKey(summary.localDate)}\u0000${summary.hour}\u0000${summary.browserBundleId ?? ''}\u0000${summary.urlKey}`,
      summary,
    );
  }
  const summaryRows = [...distinct.values()].map((summary) => ({
    source: summary.source,
    localDate: dateKey(summary.localDate),
    hostname: summary.hostname,
    activeSeconds: summary.activeSeconds,
  }));
  const devices = new Set(
    summaries.map((summary) =>
      summary.source === 'BROWSER' ? `${dateKey(summary.localDate)}\0${summary.syncDeviceId}` : '',
    ),
  );
  const fallbackRows = sessions
    .map((session) => ({
      installationId: session.installationId,
      source: 'BROWSER',
      localDate: localDateKey(session.startedAt, timezone),
      hostname: session.hostname,
      pageTitle: session.pageTitle,
      activeSeconds: session.activeSeconds,
    }))
    .filter((session) => !devices.has(`${session.localDate}\0browser-${session.installationId}`));
  return [...summaryRows, ...fallbackRows];
}

function sourceWebsiteTotals(rows: WebsiteReviewRow[]) {
  return Object.fromEntries(
    rows.reduce((totals, row) => {
      const total = totals.get(row.source) ?? { activeSeconds: 0 };
      total.activeSeconds += row.activeSeconds;
      totals.set(row.source, total);
      return totals;
    }, new Map<string, { activeSeconds: number }>()),
  );
}

function canonicalHealthRows(rows: HealthSummaryRow[]): HealthSummaryRow[] {
  const canonical = new Map<string, HealthSummaryRow>();
  for (const row of rows) {
    const key = dateKey(row.localDate);
    const current = canonical.get(key);
    if (
      !current ||
      row.updatedAt > current.updatedAt ||
      (row.updatedAt.getTime() === current.updatedAt.getTime() && row.syncDeviceId < current.syncDeviceId)
    ) {
      canonical.set(key, row);
    }
  }
  return [...canonical.values()];
}

function distinctHealthWorkoutRows(rows: HealthWorkoutRow[]): HealthWorkoutRow[] {
  const distinct = new Map<string, HealthWorkoutRow>();
  for (const row of rows) {
    const current = distinct.get(row.healthKitUUID);
    if (!current || row.startedAt < current.startedAt) distinct.set(row.healthKitUUID, row);
  }
  return [...distinct.values()];
}

function aggregateHealth(rows: HealthSummaryRow[], workoutCount: number) {
  return {
    available: rows.length > 0 || workoutCount > 0,
    steps: rows.length ? sum(rows.map((row) => row.steps)) : null,
    walkingRunningDistanceMeters: rows.length ? sum(rows.map((row) => row.walkingRunningDistanceMeters)) : null,
    activeEnergyKcal: rows.length ? sum(rows.map((row) => row.activeEnergyKcal)) : null,
    exerciseMinutes: rows.length ? sum(rows.map((row) => row.exerciseMinutes)) : null,
    standHours: nullableSum(rows.map((row) => row.standHours)),
    sleepMinutes: nullableSum(rows.map((row) => row.sleepMinutes)),
    restingHeartRateBpm: nullableAverage(rows.map((row) => row.restingHeartRateBpm)),
    hrvMilliseconds: nullableAverage(rows.map((row) => row.hrvMilliseconds)),
    workoutCount: rows.length ? sum(rows.map((row) => row.workoutCount)) : null,
    workouts: workoutCount,
    workoutMinutes: rows.length ? sum(rows.map((row) => row.workoutMinutes)) : null,
    workoutEnergyKcal: rows.length ? sum(rows.map((row) => row.workoutEnergyKcal)) : null,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function nullableSum(values: Array<number | null>): number | null {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? sum(measured) : null;
}

function nullableAverage(values: Array<number | null>): number | null {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? sum(measured) / measured.length : null;
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
  return habits.reduce<Record<string, { scheduled: number; completed: number; failed: number; skipped: number }>>(
    (result, occurrence) => {
      const current = result[occurrence.habit.name] ?? { scheduled: 0, completed: 0, failed: 0, skipped: 0 };
      current.scheduled += 1;
      if (occurrence.status === 'COMPLETED') current.completed += 1;
      if (occurrence.status === 'FAILED') current.failed += 1;
      if (occurrence.status === 'SKIPPED') current.skipped += 1;
      result[occurrence.habit.name] = current;
      return result;
    },
    {},
  );
}

function journalContext(
  entries: Array<{
    entryDate: Date;
    title: string;
    contentMarkdown: string;
    kind: string;
    tags: Array<{ tag: { name: string } }>;
  }>,
) {
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
