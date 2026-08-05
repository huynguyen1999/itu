import { Injectable } from '@nestjs/common';
import { CardStatus, CardType, ReviewDirection, ReviewGrade, StudyMode } from '@core/domain/enums';
import { ReviewStateModel } from '@core/domain/models';
import { InvalidReviewException } from '@core/domain/exceptions';
import { DomainException } from '@core/domain/exceptions';
import { CursorPageOptions } from '@core/application/ports/pagination.port';
import { normalizeCursorOptions, toCursorPage } from '@core/application/pagination/cursor-pagination';
import { IReviewStateRepository, IStudySessionRepository } from '@core/application/ports/out/repositories.port';
import type {
  DeckStatsData,
  GradeDistributionData,
  ReviewForecastData,
  StudyCalendarDayData,
  StudySessionReviewData,
} from '@core/application/ports/out/repository-types.port';
import { FocusSessionStatus, GrowthSourceType, Prisma, TaskStatus } from '@prisma/client';
import { awardGrowthActivityWithReceipt } from '@core/application/use-cases/growth-awards';
import { PrismaService } from './prisma.service';
import { mapCard, mapReviewState, mapStudySession } from './prisma.mappers';
import { createUlid } from './ulid';

function correctRate(correct: number, reviewed: number): number {
  return reviewed === 0 ? 0 : Math.round((correct / reviewed) * 100);
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function serializableWithRetry<T>(db: PrismaService, work: (tx: any) => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2034' || attempt === 2) {
        if ((error as { code?: string })?.code === 'P2034') {
          throw new DomainException(`${label} conflicted with a concurrent update; retry the request`, 'SERIALIZATION_CONFLICT', 409);
        }
        throw error;
      }
    }
  }
  throw new DomainException(`${label} conflicted with a concurrent update; retry the request`, 'SERIALIZATION_CONFLICT', 409);
}

@Injectable()
export class PrismaReviewStateRepository implements IReviewStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createInitialStates(userId: string, cardId: string, type: CardType) {
    await this.prisma.reviewState.create({
      data: { id: createUlid(), userId, cardId, direction: ReviewDirection.FRONT_TO_BACK, dueAt: new Date() },
    });
    if (type === CardType.REVERSE) {
      await this.prisma.reviewState.create({
        data: { id: createUlid(), userId, cardId, direction: ReviewDirection.BACK_TO_FRONT, dueAt: new Date() },
      });
    }
  }

  async listDue(userId: string, deckId?: string, now = new Date()) {
    const states = await this.prisma.reviewState.findMany({
      where: { userId, dueAt: { lte: now }, card: { deckId, status: CardStatus.ACTIVE, deck: { archived: false } } },
      include: { card: { include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } } } },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });
    return states.map((state) => ({ state: mapReviewState(state), card: mapCard(state.card) }));
  }

  async find(userId: string, cardId: string, direction: ReviewDirection) {
    const state = await this.prisma.reviewState.findFirst({
      where: { userId, cardId, direction, card: { status: CardStatus.ACTIVE, deck: { archived: false } } },
    });
    return state ? mapReviewState(state) : null;
  }

  async update(state: ReviewStateModel) {
    const updated = await this.prisma.reviewState.update({
      where: { id: state.id },
      data: {
        dueAt: state.dueAt,
        stability: state.stability,
        difficulty: state.difficulty,
        intervalDays: state.intervalDays,
        lapseCount: state.lapseCount,
        reviewCount: state.reviewCount,
      },
    });
    return mapReviewState(updated);
  }

  async resetCardDueAt(userId: string, cardId: string, dueAt: Date) {
    await this.prisma.reviewState.updateMany({
      where: { userId, cardId },
      data: { dueAt },
    });
  }

  async dueCountByDeck(userId: string) {
    const rows = await this.prisma.reviewState.findMany({
      where: { userId, dueAt: { lte: new Date() }, card: { status: CardStatus.ACTIVE, deck: { archived: false } } },
      select: { card: { select: { deckId: true } } },
    });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.card.deckId, (counts.get(row.card.deckId) ?? 0) + 1);
    return [...counts.entries()].map(([deckId, dueCount]) => ({ deckId, dueCount }));
  }
}

@Injectable()
export class PrismaStudySessionRepository implements IStudySessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: { deckId?: string | null; mode: StudyMode }) {
    const session = await this.prisma.studySession.create({
      data: { id: createUlid(), userId, deckId: data.deckId ?? null, mode: data.mode },
    });
    return mapStudySession(session);
  }

  async findById(userId: string, sessionId: string) {
    const session = await this.prisma.studySession.findFirst({ where: { id: sessionId, userId } });
    return session ? mapStudySession(session) : null;
  }

  async complete(userId: string, sessionId: string, data: { rating: number; reviewed?: number; correct?: number }) {
    return serializableWithRetry(this.prisma, async (tx) => {
      const session = await tx.studySession.findFirst({ where: { id: sessionId, userId } });
      if (!session) return null;
      if (session.completedAt) return mapStudySession(session);

      // Derive completion counters from the review log while holding the
      // completion transaction open. This prevents a stale pre-transaction
      // sessionStats snapshot from being persisted if a final review lands
      // concurrently.
      const [reviewed, correct] = await Promise.all([
        tx.reviewLog.count({ where: { userId, sessionId } }),
        tx.reviewLog.count({ where: { userId, sessionId, grade: { not: ReviewGrade.AGAIN } } }),
      ]);

      let growthReceipt = null;
      if (reviewed > 0 && session.deckId) {
        const deck = await tx.deck.findUnique({ where: { id: session.deckId } });
        growthReceipt = await awardGrowthActivityWithReceipt(
          tx,
          userId,
          GrowthSourceType.REVIEW_DECK,
          session.deckId,
          deck?.title ?? 'Study Session',
          {
            studyMode: session.mode,
            reviewedCount: reviewed,
            correctCount: correct,
          },
          session.id,
          { reviewedCount: reviewed },
        );
      }

      // Persist the exact receipt alongside completion so a lost response can
      // be retried and return the same authoritative award details without
      // issuing another ledger award.
      const updated = await tx.studySession.update({
        where: { id: sessionId },
        data: {
          rating: data.rating,
          reviewed,
          correct,
          completedAt: new Date(),
          growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      await tx.syncChange.create({
        data: {
          userId,
          entityType: 'studysession',
          entityId: sessionId,
          operation: 'UPSERT',
          data: updated as unknown as Prisma.InputJsonValue,
        },
      });

      return { ...mapStudySession(updated), growthReceipt };
    }, 'Study completion');
  }

  async addReviewLog(userId: string, data: any): Promise<boolean> {
    try {
      await this.prisma.reviewLog.create({
        data: {
          id: createUlid(),
          userId,
          sessionId: data.sessionId,
          cardId: data.cardId,
          cardDeckId: data.cardDeckId,
          cardPromptRichText: data.cardPromptRichText,
          cardAnswerRichText: data.cardAnswerRichText,
          cardImages: data.cardImages,
          direction: data.direction,
          grade: data.grade,
          userAnswer: data.userAnswer,
          responseMs: data.responseMs,
          previousDueAt: data.previousDueAt,
          nextDueAt: data.nextDueAt,
          previousInterval: data.previousInterval,
          nextInterval: data.nextInterval,
          idempotencyKey: data.idempotencyKey,
        },
      });
      return true;
    } catch (error) {
      if (data.idempotencyKey && (error as { code?: string })?.code === 'P2002') {
        const existing = await this.findReviewLogByIdempotencyKey(userId, data.idempotencyKey);
        if (existing) {
          const samePayload =
            existing.sessionId === data.sessionId &&
            existing.cardId === data.cardId &&
            existing.direction === data.direction &&
            existing.grade === data.grade &&
            (existing.userAnswer ?? null) === (data.userAnswer ?? null) &&
            (existing.responseMs ?? null) === (data.responseMs ?? null);
          if (!samePayload) {
            throw new InvalidReviewException('Review idempotency key was reused with a different payload');
          }
          return false;
        }
      }
      throw error;
    }
  }

  async findReviewLogByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.prisma.reviewLog.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  }

  async recent(userId: string, limit: number) {
    const sessions = await this.prisma.studySession.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: limit,
    });
    return sessions.map(mapStudySession);
  }

  countCompletedOnOrAfter(userId: string, since: Date) {
    return this.prisma.studySession.count({ where: { userId, completedAt: { gte: since } } });
  }

  countCompletedBetween(userId: string, from: Date, to: Date) {
    return this.prisma.studySession.count({ where: { userId, completedAt: { gte: from, lt: to } } });
  }

  async retentionRate(userId: string, since: Date) {
    const [total, correct] = await Promise.all([
      this.prisma.reviewLog.count({ where: { userId, createdAt: { gte: since } } }),
      this.prisma.reviewLog.count({ where: { userId, createdAt: { gte: since }, grade: { not: ReviewGrade.AGAIN } } }),
    ]);
    return total === 0 ? 0 : Math.round((correct / total) * 100);
  }

  async studyCalendar(userId: string, from: Date, to: Date): Promise<StudyCalendarDayData[]> {
    const [sessions, tasks, focusSessions, cards] = await Promise.all([
      this.prisma.studySession.findMany({
        where: { userId, completedAt: { gte: from, lt: to } },
        select: { completedAt: true, reviewed: true, correct: true },
      }),
      this.prisma.task.findMany({
        where: { userId, status: TaskStatus.COMPLETED, completedAt: { gte: from, lt: to }, deletedAt: null },
        select: { completedAt: true },
      }),
      this.prisma.focusSession.findMany({
        where: { userId, status: FocusSessionStatus.COMPLETED, completedAt: { gte: from, lt: to } },
        select: {
          startedAt: true,
          completedAt: true,
          adjustedStartedAt: true,
          adjustedCompletedAt: true,
          accumulatedPauseSecs: true,
        },
      }),
      this.prisma.card.findMany({
        where: { userId, createdAt: { gte: from, lt: to } },
        select: { createdAt: true },
      }),
    ]);

    const days = new Map<string, StudyCalendarDayData>();

    const getOrCreate = (date: string): StudyCalendarDayData => {
      const existing = days.get(date);
      if (existing) return existing;
      const created: StudyCalendarDayData = {
        date,
        sessions: 0,
        focusSessions: 0,
        reviews: 0,
        correct: 0,
        completedTasks: 0,
        focusedMinutes: 0,
        cardsCreated: 0,
      };
      days.set(date, created);
      return created;
    };

    for (const session of sessions) {
      if (!session.completedAt) continue;
      const date = formatDateKey(session.completedAt);
      const current = getOrCreate(date);
      current.sessions += 1;
      current.reviews += session.reviewed;
      current.correct += session.correct;
    }

    for (const task of tasks) {
      if (!task.completedAt) continue;
      const date = formatDateKey(task.completedAt);
      const current = getOrCreate(date);
      current.completedTasks += 1;
    }

    for (const focus of focusSessions) {
      const end = focus.adjustedCompletedAt ?? focus.completedAt ?? focus.startedAt;
      const date = formatDateKey(end);
      const current = getOrCreate(date);
      current.focusSessions += 1;
      const start = focus.adjustedStartedAt ?? focus.startedAt;
      const durationSecs = Math.max(
        0,
        Math.floor((end.getTime() - start.getTime()) / 1000) - focus.accumulatedPauseSecs,
      );
      current.focusedMinutes += Math.round(durationSecs / 60);
    }

    for (const card of cards) {
      const date = formatDateKey(card.createdAt);
      const current = getOrCreate(date);
      current.cardsCreated += 1;
    }

    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async deckStats(userId: string, deckId: string, now = new Date()): Promise<DeckStatsData | null> {
    const deck = await this.prisma.deck.findFirst({ where: { userId, id: deckId, archived: false } });
    if (!deck) return null;

    const inThirtyDays = new Date(now);
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    const [totalCards, logs, dueStates] = await Promise.all([
      this.prisma.card.count({ where: { userId, deckId, status: CardStatus.ACTIVE, deck: { archived: false } } }),
      this.prisma.reviewLog.findMany({
        where: { userId, cardDeckId: deckId },
        select: { grade: true },
      }),
      this.prisma.reviewState.findMany({
        where: {
          userId,
          card: { deckId, status: CardStatus.ACTIVE, deck: { archived: false } },
          dueAt: { gte: startOfDay(now), lt: inThirtyDays },
        },
        select: { dueAt: true },
      }),
    ]);

    const gradeDistribution: GradeDistributionData = { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 };
    for (const log of logs) {
      gradeDistribution[log.grade as ReviewGrade] += 1;
    }

    const forecastByDate = new Map<string, number>();
    for (const state of dueStates) {
      const date = formatDateKey(state.dueAt);
      forecastByDate.set(date, (forecastByDate.get(date) ?? 0) + 1);
    }
    const upcomingReviewForecast: ReviewForecastData[] = [...forecastByDate.entries()]
      .map(([date, dueCount]) => ({ date, dueCount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const correct = gradeDistribution.HARD + gradeDistribution.GOOD + gradeDistribution.EASY;
    return {
      deckId,
      totalCards,
      retentionRate: logs.length === 0 ? 0 : Math.round((correct / logs.length) * 100),
      gradeDistribution,
      upcomingReviewForecast,
    };
  }

  async sessionStats(userId: string, sessionId: string) {
    const logs = await this.prisma.reviewLog.findMany({ where: { userId, sessionId }, select: { grade: true } });
    return {
      reviewed: logs.length,
      correct: logs.filter((log) => log.grade !== ReviewGrade.AGAIN).length,
    };
  }

  async sessionReviews(userId: string, sessionId: string) {
    const logs = await this.prisma.reviewLog.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        cardId: true,
        cardPromptRichText: true,
        cardAnswerRichText: true,
        cardImages: true,
        direction: true,
        grade: true,
        userAnswer: true,
      },
    });
    return logs.map((log) => ({
      cardId: log.cardId,
      direction: log.direction as ReviewDirection,
      grade: log.grade as ReviewGrade,
      userAnswer: log.userAnswer,
      promptRichText: log.cardPromptRichText,
      answerRichText: log.cardAnswerRichText,
      images: (Array.isArray(log.cardImages) ? log.cardImages : []) as unknown as StudySessionReviewData['images'],
    }));
  }

  async sessionHistory(userId: string, options?: CursorPageOptions) {
    const normalized = normalizeCursorOptions(options);
    const sessions = await this.prisma.studySession.findMany({
      where: {
        userId,
        completedAt: { not: null },
        ...(normalized.cursor
          ? {
              OR: [
                { completedAt: { lt: normalized.cursor.createdAt } },
                { completedAt: normalized.cursor.createdAt, id: { lt: normalized.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: normalized.limit + 1,
    });
    const deckIds = Array.from(
      new Set(sessions.map((session) => session.deckId).filter((id): id is string => Boolean(id))),
    );
    const decks = deckIds.length
      ? await this.prisma.deck.findMany({ where: { userId, id: { in: deckIds } }, select: { id: true, title: true } })
      : [];
    const deckTitleById = new Map(decks.map((deck) => [deck.id, deck.title]));
    const data = sessions.map((session) => ({
      id: session.id,
      deckId: session.deckId,
      deckTitle: session.deckId ? (deckTitleById.get(session.deckId) ?? null) : null,
      mode: session.mode as StudyMode,
      rating: session.rating,
      reviewed: session.reviewed,
      correct: session.correct,
      correctRate: correctRate(session.correct, session.reviewed),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    }));
    return toCursorPage(data, normalized.limit, (session) => session.completedAt ?? session.startedAt);
  }

  async activeRecallTrend(userId: string, limit: number) {
    const sessions = await this.prisma.studySession.findMany({
      where: { userId, completedAt: { not: null }, reviewed: { gt: 0 } },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return sessions.reverse().map((session) => ({
      id: session.id,
      completedAt: session.completedAt ?? session.startedAt,
      correctRate: correctRate(session.correct, session.reviewed),
      reviewed: session.reviewed,
      correct: session.correct,
      rating: session.rating,
    }));
  }
}
