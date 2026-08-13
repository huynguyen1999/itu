import { createUlid } from '../sync/syncIdentity';
import type { ApiClientContext } from './apiContext';
import type {
  AiJob,
  AiSessionFeedback,
  Card,
  CardGrading,
  CardImage,
  CardSide,
  CreateCardRequest,
  CursorPage,
  CursorPageParams,
  DashboardSummary,
  Deck,
  DeckColor,
  DeckIcon,
  DeckListItem,
  DeckStats,
  DueItem,
  StartSessionMode,
  StudyCalendarDay,
  StudySessionCompletion,
  StudySessionDetails,
  StudySessionHistoryItem,
  SubmitReviewRequest,
  TrashSnapshot,
  UpdateCardRequest,
} from './types';

export function createDeckStudyApi(ctx: ApiClientContext) {
  return {
    dashboard() {
      return ctx.request<DashboardSummary>('/dashboard/summary');
    },
    studyCalendar(days = 180) {
      return ctx.request<StudyCalendarDay[]>(`/dashboard/study-calendar?days=${days}`);
    },
    deckStats(deckId: string) {
      return ctx.request<DeckStats>(`/dashboard/decks/${deckId}/stats`);
    },
    decks(params: CursorPageParams = {}) {
      return ctx.request<CursorPage<DeckListItem>>(withQuery('/decks', params));
    },
    deck(deckId: string) {
      return ctx.request<Deck>(`/decks/${deckId}`);
    },
    createDeck(data: { title: string; description?: string; icon?: DeckIcon; color?: DeckColor }) {
      const id = createUlid();
      const optimistic = {
        id,
        ...data,
        icon: data.icon ?? 'BOOK',
        color: data.color ?? 'TEAL',
        isDefault: false,
        archived: false,
        version: 1,
        studyStats: {
          totalCards: 0,
          toReviewCount: 0,
          newCount: 0,
          dueCount: 0,
          reviewedCount: 0,
          lastStudiedAt: null,
        },
      } as DeckListItem;
      return ctx.offlineMutation({ kind: 'deck.create', entityId: id, payload: data, optimistic }, () =>
        ctx.request<Deck>('/decks', { method: 'POST', body: JSON.stringify(data) }),
      );
    },
    updateDeck(
      deckId: string,
      data: { title: string; description?: string | null; icon?: DeckIcon; color?: DeckColor; version?: number },
    ) {
      return ctx.offlineMutation(
        {
          kind: 'deck.update',
          entityId: deckId,
          payload: data,
          baseVersion: data.version,
          optimistic: { id: deckId, ...data } as Deck,
        },
        () => ctx.request<Deck>(`/decks/${deckId}`, { method: 'PATCH', body: JSON.stringify(data) }),
      );
    },
    deleteDeck(deckId: string) {
      return ctx.offlineMutation(
        { kind: 'deck.delete', entityId: deckId, payload: {}, immediate: true, optimistic: undefined },
        () => ctx.request<void>(`/decks/${deckId}`, { method: 'DELETE' }),
      );
    },
    trash() {
      return ctx.request<TrashSnapshot>('/trash');
    },
    restoreDeck(deckId: string) {
      return ctx.offlineMutation(
        { kind: 'deck.restore', entityId: deckId, payload: {}, immediate: true, optimistic: { id: deckId } as Deck },
        () => ctx.request<Deck>(`/trash/decks/${deckId}/restore`, { method: 'POST' }),
      );
    },
    restoreCard(cardId: string) {
      return ctx.offlineMutation(
        { kind: 'card.restore', entityId: cardId, payload: {}, immediate: true, optimistic: { id: cardId } as Card },
        () => ctx.request<Card>(`/trash/cards/${cardId}/restore`, { method: 'POST' }),
      );
    },
    restoreCardImage(imageId: string) {
      return ctx.offlineMutation(
        {
          kind: 'cardimage.restore',
          entityId: imageId,
          payload: {},
          immediate: true,
          optimistic: { id: imageId } as CardImage,
        },
        () => ctx.request<CardImage>(`/trash/card-images/${imageId}/restore`, { method: 'POST' }),
      );
    },
    deleteTrashDeck(deckId: string) {
      return ctx.request<{ ok: true }>(`/trash/decks/${deckId}`, { method: 'DELETE' });
    },
    deleteTrashCard(cardId: string) {
      return ctx.request<{ ok: true }>(`/trash/cards/${cardId}`, { method: 'DELETE' });
    },
    deleteTrashCardImage(imageId: string) {
      return ctx.request<{ ok: true }>(`/trash/card-images/${imageId}`, { method: 'DELETE' });
    },
    cards(deckId: string, params: CursorPageParams = {}) {
      return ctx.request<CursorPage<Card>>(withQuery(`/decks/${deckId}/cards`, params));
    },
    createCard(deckId: string, data: CreateCardRequest) {
      const id = createUlid();
      const optimistic = {
        id,
        deckId,
        ...data,
        tags: data.tags ?? [],
        images: [],
        reviewSummary: { nextDueAt: new Date().toISOString(), reviewCount: 0 },
        version: 1,
      } as Card;
      return ctx.offlineMutation({ kind: 'card.create', entityId: id, payload: { ...data, deckId }, optimistic }, () =>
        ctx.request<Card>(`/decks/${deckId}/cards`, { method: 'POST', body: JSON.stringify(data) }),
      );
    },
    updateCard(deckId: string, cardId: string, data: UpdateCardRequest) {
      return ctx.offlineMutation(
        {
          kind: 'card.update',
          entityId: cardId,
          payload: { ...data },
          baseVersion: data.version,
          optimistic: { id: cardId, deckId, ...data } as Card,
        },
        () => ctx.request<Card>(`/decks/${deckId}/cards/${cardId}`, { method: 'PATCH', body: JSON.stringify(data) }),
      );
    },
    deleteCard(deckId: string, cardId: string) {
      return ctx.offlineMutation(
        { kind: 'card.delete', entityId: cardId, payload: {}, immediate: true, optimistic: undefined },
        () => ctx.request<void>(`/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' }),
      );
    },
    moveCards(cardIds: string[], targetDeckId: string) {
      return ctx.request<{ movedCardIds: string[]; targetDeckId: string }>('/cards/move', {
        method: 'POST',
        body: JSON.stringify({ cardIds, targetDeckId }),
      });
    },
    importCards(
      deckName: string,
      items: Array<{ question: string; answer: string; nextReviewDate?: string; generateReverse?: boolean }>,
    ) {
      return ctx.request<Card[]>('/decks/import', {
        method: 'POST',
        body: JSON.stringify({ deckName, items }),
      });
    },
    uploadCardImage(cardId: string, side: CardSide, file: File) {
      const form = new FormData();
      form.set('side', side);
      form.set('image', file);
      return ctx.request<CardImage>(`/cards/${cardId}/images`, { method: 'POST', body: form });
    },
    due(deckId?: string) {
      return ctx.request<DueItem[]>(`/study/due${deckId ? `?deckId=${deckId}` : ''}`);
    },
    sessionHistory(params: CursorPageParams = {}) {
      return ctx.request<CursorPage<StudySessionHistoryItem>>(withQuery('/study/sessions', params));
    },
    startSession(deckId: string | undefined, mode: StartSessionMode) {
      const id = createUlid();
      return ctx.offlineMutation(
        { kind: 'session.start', entityId: id, payload: { deckId, mode }, immediate: true, optimistic: { id } },
        () =>
          ctx.request<{ id: string }>('/study/sessions', { method: 'POST', body: JSON.stringify({ deckId, mode }) }),
      );
    },
    submitReview(sessionId: string, data: SubmitReviewRequest) {
      const id = createUlid();
      const payload = { ...data, idempotencyKey: data.idempotencyKey ?? createUlid() };
      return ctx.offlineMutation(
        {
          kind: 'review.create',
          entityId: id,
          payload: { ...payload, sessionId },
          immediate: true,
          optimistic: { id },
        },
        () => ctx.request(`/study/sessions/${sessionId}/reviews`, { method: 'POST', body: JSON.stringify(payload) }),
      );
    },
    completeSession(sessionId: string, rating: number) {
      return ctx.offlineMutation<StudySessionCompletion>(
        {
          kind: 'session.complete',
          entityId: sessionId,
          payload: { rating },
          immediate: true,
          optimistic: { id: sessionId, rating },
        },
        () =>
          ctx.request<StudySessionCompletion>(`/study/sessions/${sessionId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ rating }),
          }),
      );
    },
    sessionDetails(sessionId: string) {
      return ctx.request<StudySessionDetails>(`/study/sessions/${sessionId}`);
    },
    suggestCards(pastedText: string) {
      const id = createUlid();
      return ctx.offlineMutation(
        {
          kind: 'ai.card_generation',
          entityId: id,
          payload: { pastedText },
          immediate: true,
          optimistic: { id, status: 'QUEUED' },
        },
        () => ctx.request<AiJob>('/ai/card-suggestions', { method: 'POST', body: JSON.stringify({ pastedText }) }),
      );
    },
    requestSessionFeedback(sessionId: string) {
      const id = createUlid();
      return ctx.offlineMutation(
        {
          kind: 'ai.session_feedback',
          entityId: id,
          payload: { sessionId },
          immediate: true,
          optimistic: { id, status: 'QUEUED' },
        },
        () => ctx.request<AiJob>(`/ai/session-feedback/${sessionId}`, { method: 'POST' }),
      );
    },
    generateReviewInsights(entryId: string) {
      return ctx.request<Record<string, unknown>>(`/journal/entries/${entryId}/ai-insights`, {
        method: 'POST',
      });
    },
    sessionFeedback(sessionId: string) {
      return ctx.request<AiSessionFeedback | null>(`/ai/session-feedback/${sessionId}`);
    },
    job(jobId: string) {
      return ctx.request<AiJob>(`/ai/jobs/${jobId}`);
    },
    suggestCardsStream(pastedText: string) {
      return ctx.stream('/ai/card-suggestions/stream', { method: 'POST', body: JSON.stringify({ pastedText }) });
    },
    sessionSummaryStream(sessionId: string) {
      return ctx.stream(`/ai/session-feedback/${sessionId}/summary-stream`, { method: 'POST' });
    },
    sessionGrading(sessionId: string, summary: string) {
      return ctx.request<{ cardGradings: CardGrading[]; confidence?: number; gradePoint?: number }>(
        `/ai/session-feedback/${sessionId}/grading`,
        { method: 'POST', body: JSON.stringify({ summary }) },
      );
    },
  };
}

export type DeckStudyApi = ReturnType<typeof createDeckStudyApi>;

function withQuery(path: string, params: CursorPageParams): string {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit) search.set('limit', String(params.limit));
  const q = params.q?.trim();
  if (q) search.set('q', q);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
