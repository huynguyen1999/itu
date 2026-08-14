import { Inject, Injectable } from '@nestjs/common';
import { REVIEW_DATA_SOURCE, type IReviewDataSource, type ReviewRangeInput } from '../ports/out/review-data-source.port';
import type {
  ReviewComparison,
  ReviewContextV1,
  ReviewEvidence,
  ReviewPeriod,
} from '@core/domain/review/review.types';

export const REVIEW_PROMPT_VERSION = 'review-insights-v1' as const;

@Injectable()
export class ReviewContextBuilder {
  constructor(@Inject(REVIEW_DATA_SOURCE) private readonly source: IReviewDataSource) {}

  async build(
    userId: string,
    input: ReviewRangeInput,
    reflections: Record<string, string>,
    entryId?: string,
  ): Promise<ReviewContextV1> {
    const period = toPeriod(input.startDate, input.endDate, input.timezone);
    const current = await this.source.loadPeriodData(userId, period, entryId);
    const context: ReviewContextV1 = {
      version: 1,
      reviewKind: input.kind,
      period,
      coverage: current.coverage,
      metrics: current.metrics,
      details: current.details,
      reflections,
      evidence: buildEvidence(current.metrics, input.kind),
    };

    if (input.kind === 'WEEKLY') {
      const durationDays = dateDistance(input.startDate, input.endDate) + 1;
      const previousEnd = addDays(input.startDate, -1);
      const previousStart = addDays(previousEnd, -durationDays + 1);
      const previousPeriod = toPeriod(previousStart, previousEnd, input.timezone);
      const previous = await this.source.loadPeriodData(userId, previousPeriod, entryId);
      context.previousPeriod = {
        period: previousPeriod,
        metrics: previous.metrics,
        comparison: compareMetrics(current.metrics, previous.metrics),
      };
      context.evidence.push(...buildComparisonEvidence(current.metrics, previous.metrics));
    }
    return context;
  }
}

export function toPeriod(startDate: string, endDate: string, timezone: string): ReviewPeriod {
  const startInclusive = zonedMidnight(startDate, timezone);
  const endExclusive = zonedMidnight(addDays(endDate, 1), timezone);
  return {
    startDate,
    endDate,
    timezone,
    startInclusive: startInclusive.toISOString(),
    endExclusive: endExclusive.toISOString(),
  };
}

export function compareMetric(current: number, previous: number): ReviewComparison {
  const absoluteDelta = current - previous;
  if (current === previous) return { current, previous, absoluteDelta: 0, percentDelta: 0, direction: 'UNCHANGED' };
  if (previous === 0) return { current, previous, absoluteDelta, percentDelta: null, direction: 'NEW' };
  return {
    current,
    previous,
    absoluteDelta,
    percentDelta: Math.round((absoluteDelta / Math.abs(previous)) * 10000) / 100,
    direction: absoluteDelta > 0 ? 'UP' : 'DOWN',
  };
}

function compareMetrics(current: Record<string, unknown>, previous: Record<string, unknown>): Record<string, ReviewComparison> {
  const pairs: Record<string, [string, string]> = {
    'tasks.completed': ['tasks', 'completed'],
    'focus.minutes': ['focus', 'minutes'],
    'focus.sessions': ['focus', 'sessions'],
    'learning.reviews': ['learning', 'reviews'],
    'habits.completionRate': ['habits', 'completionRate'],
    'gym.workouts': ['gym', 'workouts'],
    'gym.sets': ['gym', 'sets'],
    'appUsage.activeSeconds': ['appUsage', 'activeSeconds'],
    'websiteUsage.activeSeconds': ['websiteUsage', 'activeSeconds'],
  };
  return Object.fromEntries(
    Object.entries(pairs).map(([id, [domain, metric]]) => [
      id,
      compareMetric(numberAt(current, domain, metric), numberAt(previous, domain, metric)),
    ]),
  );
}

function buildEvidence(metrics: Record<string, unknown>, kind: 'DAILY' | 'WEEKLY'): ReviewEvidence[] {
  const labels: Array<[string, string, string]> = [
    ['tasks.completed', 'TASK', `${numberAt(metrics, 'tasks', 'completed')} tasks completed`],
    ['focus.total_minutes', 'FOCUS', `${numberAt(metrics, 'focus', 'minutes')} focused minutes`],
    ['learning.reviews', 'LEARNING', `${numberAt(metrics, 'learning', 'reviews')} reviews completed`],
    ['habits.completion_rate', 'HABIT', `${Math.round(numberAt(metrics, 'habits', 'completionRate') * 100)}% habit completion`],
    ['gym.workouts', 'GYM', `${numberAt(metrics, 'gym', 'workouts')} workouts`],
    ['appUsage.active_seconds', 'APP', `${numberAt(metrics, 'appUsage', 'activeSeconds')} seconds of app activity`],
    ['websiteUsage.active_seconds', 'WEBSITE', `${numberAt(metrics, 'websiteUsage', 'activeSeconds')} seconds of website activity`],
  ];
  return labels.filter(([, , label]) => !label.startsWith('0 ')).map(([id, source, label]) => ({ id, source, label: kind === 'WEEKLY' ? `${label} this week` : label }));
}

function buildComparisonEvidence(current: Record<string, unknown>, previous: Record<string, unknown>): ReviewEvidence[] {
  return [
    ['comparison.tasks.completed', 'TASK', 'tasks', 'completed'],
    ['comparison.focus.total_minutes', 'FOCUS', 'focus', 'minutes'],
    ['comparison.habits.completion_rate', 'HABIT', 'habits', 'completionRate'],
    ['comparison.gym.workouts', 'GYM', 'gym', 'workouts'],
    ['comparison.appUsage.active_seconds', 'APP', 'appUsage', 'activeSeconds'],
    ['comparison.websiteUsage.active_seconds', 'WEBSITE', 'websiteUsage', 'activeSeconds'],
  ].map(([id, source, domain, metric]) => ({
    id,
    source,
    label: `${numberAt(current, domain, metric)} vs ${numberAt(previous, domain, metric)} last week`,
  }));
}

function numberAt(source: Record<string, unknown>, domain: string, metric: string): number {
  const value = (source[domain] as Record<string, unknown> | undefined)?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateDistance(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function zonedMidnight(date: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  let guess = Date.UTC(year, month - 1, day);
  const target = guess;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    guess -= asUtc - target;
  }
  return new Date(guess);
}
