export interface DashboardSummary {
  dueCount: number;
  streakDays: number;
  retentionRate: number;
  decks: Array<{
    id: string;
    title: string;
    dueCount: number;
    totalCards: number;
  }>;
  recentSessions: Array<{
    id: string;
    mode: string;
    rating?: number | null;
    reviewed: number;
    correct: number;
    completedAt?: Date | null;
  }>;
  activeRecallTrend: Array<{
    id: string;
    completedAt: Date;
    correctRate: number;
    reviewed: number;
    correct: number;
    rating?: number | null;
  }>;
}

export interface StudyCalendarDay {
  date: string;
  sessions: number;
  focusSessions: number;
  reviews: number;
  correct: number;
  completedTasks: number;
  focusedMinutes: number;
  cardsCreated: number;
}

export interface DeckStats {
  deckId: string;
  totalCards: number;
  retentionRate: number;
  gradeDistribution: {
    AGAIN: number;
    HARD: number;
    GOOD: number;
    EASY: number;
  };
  upcomingReviewForecast: Array<{
    date: string;
    dueCount: number;
  }>;
}

export interface IDashboardUseCase {
  summary(userId: string): Promise<DashboardSummary>;
  studyCalendar(userId: string, days?: number): Promise<StudyCalendarDay[]>;
  deckStats(userId: string, deckId: string): Promise<DeckStats>;
}
