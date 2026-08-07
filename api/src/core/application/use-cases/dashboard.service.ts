import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type {
  DashboardSummary,
  DeckStats,
  IDashboardUseCase,
  StudyCalendarDay,
} from '@core/application/ports/in/dashboard-use-case.port';
import type {
  IDeckRepository,
  IReviewStateRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import { EntityNotFoundException } from '@core/domain/exceptions';

@Injectable()
export class DashboardService implements IDashboardUseCase {
  constructor(
    @Inject(TOKENS.DECK_REPOSITORY) private readonly decks: IDeckRepository,
    @Inject(TOKENS.REVIEW_STATE_REPOSITORY) private readonly reviewStates: IReviewStateRepository,
    @Inject(TOKENS.STUDY_SESSION_REPOSITORY) private readonly sessions: IStudySessionRepository,
  ) {}

  async summary(userId: string): Promise<DashboardSummary> {
    const [decks, dueByDeck, recentSessions, retentionRate, activeRecallTrend] = await Promise.all([
      this.decks.list(userId),
      this.reviewStates.dueCountByDeck(userId),
      this.sessions.recent(userId, 8),
      this.sessions.retentionRate(userId, daysAgo(30)),
      this.sessions.activeRecallTrend(userId, 14),
    ]);
    const dueMap = new Map(dueByDeck.map((entry) => [entry.deckId, entry.dueCount]));

    return {
      dueCount: dueByDeck.reduce((sum, entry) => sum + entry.dueCount, 0),
      streakDays: await this.calculateStreak(userId),
      retentionRate,
      decks: decks.map((deck) => ({
        id: deck.id,
        title: deck.title,
        dueCount: dueMap.get(deck.id) ?? 0,
        totalCards: 0,
      })),
      recentSessions: recentSessions.map((session) => ({
        id: session.id,
        mode: session.mode,
        rating: session.rating,
        reviewed: session.reviewed,
        correct: session.correct,
        completedAt: session.completedAt,
      })),
      activeRecallTrend,
    };
  }

  async studyCalendar(userId: string, days = 180): Promise<StudyCalendarDay[]> {
    const cappedDays = Math.min(Math.max(days, 1), 366);
    const from = startOfDay(daysAgo(cappedDays - 1));
    const to = startOfDay(daysAgo(-1));
    return this.sessions.studyCalendar(userId, from, to);
  }

  async deckStats(userId: string, deckId: string): Promise<DeckStats> {
    const stats = await this.sessions.deckStats(userId, deckId);
    if (!stats) {
      throw new EntityNotFoundException('Deck', deckId);
    }
    return stats;
  }

  private async calculateStreak(userId: string): Promise<number> {
    let streak = 0;
    for (let day = 0; day < 365; day += 1) {
      const from = startOfDay(daysAgo(day));
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      const count = await this.sessions.countCompletedBetween(userId, from, to);
      if (count === 0) break;
      streak += 1;
    }
    return streak;
  }
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
