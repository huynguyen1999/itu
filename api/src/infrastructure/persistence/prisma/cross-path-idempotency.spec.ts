import { FocusMode, FocusPhase, FocusSessionStatus } from '@prisma/client';
import { ReviewDirection, ReviewGrade } from '@core/domain/enums';
import { PrismaProductivityHabits } from './prisma-productivity-habits';
import { PrismaSyncRepository } from './prisma-sync.repository';
import { StudyService } from '@core/application/use-cases/study.service';
import { SrsSchedulerService } from '@core/application/use-cases/srs-scheduler.service';

describe('cross-path idempotency', () => {
  it('sync review -> direct replay and mismatch are deduplicated by the shared key', async () => {
    const review = {
      id: 'sync-review-1', userId: 'user-1', sessionId: 'session-1', cardId: 'card-1',
      direction: ReviewDirection.FRONT_TO_BACK, grade: ReviewGrade.GOOD, userAnswer: 'answer', responseMs: 250,
    };
    const state = { id: 'state-1', userId: 'user-1', cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK, dueAt: new Date(), stability: 1, difficulty: 5, intervalDays: 0, lapseCount: 0, reviewCount: 0 };
    const created = { ...review, idempotencyKey: 'shared-review-key' };
    const tx: any = {
      reviewLog: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => where.userId_idempotencyKey ? null : null),
        create: jest.fn().mockResolvedValue(created),
      },
      reviewState: { findUnique: jest.fn().mockResolvedValue(state), update: jest.fn().mockResolvedValue(state) },
      card: { findFirst: jest.fn().mockResolvedValue({ id: 'card-1', userId: 'user-1', deckId: null, promptRichText: 'Q', answerRichText: 'A', images: [] }) },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const sync = new PrismaSyncRepository({ $transaction: jest.fn() } as never, new SrsSchedulerService());
    await (sync as any).applyReview(tx, 'user-1', {
      id: 'mutation-1', kind: 'review.create', entityId: review.id, occurredAt: new Date().toISOString(),
      payload: { sessionId: review.sessionId, cardId: review.cardId, direction: review.direction, grade: review.grade, userAnswer: ' answer ', responseMs: 250, idempotencyKey: 'shared-review-key' },
    });
    expect(tx.reviewLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: 'shared-review-key' }) }));

    const service = new StudyService(
      { find: jest.fn().mockResolvedValue(state) } as any,
      { findById: jest.fn().mockResolvedValue({ id: 'session-1', completedAt: null }), findReviewLogByIdempotencyKey: jest.fn().mockResolvedValue(created), addReviewLog: jest.fn() } as any,
      { findById: jest.fn().mockResolvedValue({ id: 'card-1', deckId: null, promptRichText: 'Q', answerRichText: 'A', images: [] }) } as any,
      new SrsSchedulerService(),
    );
    await expect(service.submitReview('user-1', 'session-1', { cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK, grade: ReviewGrade.GOOD, userAnswer: ' answer ', responseMs: 250, idempotencyKey: 'shared-review-key' })).resolves.toEqual(expect.objectContaining({ state }));
    await expect(service.submitReview('user-1', 'session-1', { cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK, grade: ReviewGrade.AGAIN, idempotencyKey: 'shared-review-key' })).rejects.toThrow('different payload');

    const directToSyncTx: any = { ...tx, reviewLog: { findUnique: jest.fn().mockImplementation(({ where }: any) => where.userId_idempotencyKey ? created : null) } };
    await expect((sync as any).applyReview(directToSyncTx, 'user-1', {
      id: 'mutation-direct-retry', kind: 'review.create', entityId: 'different-entity-id', occurredAt: new Date().toISOString(),
      payload: { sessionId: review.sessionId, cardId: review.cardId, direction: review.direction, grade: review.grade, userAnswer: 'answer', responseMs: 250, idempotencyKey: 'shared-review-key' },
    })).resolves.toBeNull();
    await expect((sync as any).applyReview(directToSyncTx, 'user-1', {
      id: 'mutation-direct-mismatch', kind: 'review.create', entityId: 'different-entity-id-2', occurredAt: new Date().toISOString(),
      payload: { sessionId: review.sessionId, cardId: review.cardId, direction: review.direction, grade: ReviewGrade.AGAIN, idempotencyKey: 'shared-review-key' },
    })).rejects.toThrow('different payload');
  });

  it('sync focus action -> direct replay returns the same event receipt and rejects mismatch', async () => {
    const eventStore: any[] = [];
    const session = { id: 'focus-1', userId: 'user-1', status: FocusSessionStatus.ACTIVE, phase: FocusPhase.WORK, mode: FocusMode.COUNTDOWN, startedAt: new Date(), accumulatedPauseSecs: 0, version: 1 };
    const tx: any = {
      focusSession: { findFirst: jest.fn().mockResolvedValue(session), update: jest.fn().mockResolvedValue({ ...session, status: FocusSessionStatus.PAUSED, version: 2 }) },
      focusEvent: { findUnique: jest.fn().mockImplementation(() => eventStore[0] ?? null), create: jest.fn().mockImplementation(async ({ data }) => { eventStore.push({ ...data, growthReceipt: null }); return eventStore[0]; }), update: jest.fn() },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const sync = new PrismaSyncRepository({ $transaction: jest.fn() } as never, new SrsSchedulerService());
    await (sync as any).applyMutation(tx, 'user-1', {
      id: 'mutation-focus-1', kind: 'focussession.action', entityId: 'focus-1', baseVersion: 1, baseValues: {}, occurredAt: new Date().toISOString(),
      payload: { action: 'pause', idempotencyKey: 'shared-focus-key' },
    }, { growthReceipt: undefined });
    eventStore[0].payload = Object.fromEntries(Object.entries(eventStore[0].payload).reverse());
    await expect((sync as any).applyMutation(tx, 'user-1', {
      id: 'mutation-focus-retry', kind: 'focussession.action', entityId: 'focus-1', baseVersion: 1, baseValues: {}, occurredAt: new Date().toISOString(),
      payload: { action: 'pause', idempotencyKey: 'shared-focus-key' },
    }, { growthReceipt: undefined })).resolves.toBeNull();
    const direct = new PrismaProductivityHabits({ $transaction: jest.fn(async (cb: any) => cb(tx)) } as never);
    await expect(direct.focusAction('user-1', 'focus-1', 'pause', { idempotencyKey: 'shared-focus-key' })).resolves.toEqual(expect.objectContaining({ id: 'focus-1', growthReceipt: null }));
    await expect(direct.focusAction('user-1', 'focus-1', 'resume', { idempotencyKey: 'shared-focus-key' })).rejects.toThrow('different payload');
  });

  it('sync focus create/adjust keys replay through direct paths', async () => {
    const focusId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const session = { id: focusId, userId: 'user-1', taskId: null, presetId: null, policyId: null, mode: FocusMode.COUNTDOWN, phase: FocusPhase.WORK, status: FocusSessionStatus.ACTIVE, plannedSeconds: 120, ownerDeviceId: null, startedAt: new Date(), accumulatedPauseSecs: 0, version: 1 };
    const tx: any = {
      focusSession: {
        findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(session), update: jest.fn().mockResolvedValue({ ...session, version: 2 }),
      },
      focusEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const sync = new PrismaSyncRepository({ $transaction: jest.fn() } as never, new SrsSchedulerService());
    await (sync as any).applyMutation(tx, 'user-1', {
      id: 'mutation-focus-create', kind: 'focussession.create', entityId: focusId, occurredAt: new Date().toISOString(),
      payload: { idempotencyKey: 'start-key', mode: FocusMode.COUNTDOWN, phase: FocusPhase.WORK, plannedSeconds: 120 },
    }, {});
    const direct = new PrismaProductivityHabits({
      focusSession: { findUnique: jest.fn().mockResolvedValue({ ...session, startIdempotencyKey: 'start-key' }) },
    } as never);
    await expect(direct.createFocusSession('user-1', { idempotencyKey: 'start-key', mode: FocusMode.COUNTDOWN, phase: FocusPhase.WORK, plannedSeconds: 120 })).resolves.toEqual(expect.objectContaining({ id: focusId }));
    await expect(direct.createFocusSession('user-1', { idempotencyKey: 'start-key', mode: FocusMode.COUNTDOWN, phase: FocusPhase.WORK, plannedSeconds: 240 })).rejects.toThrow('different payload');

    const adjustEvent = { id: 'event-adjust', sessionId: focusId, idempotencyKey: 'adjust-key', payload: { action: 'adjust', startedAt: '2026-08-03T08:00:00Z', completedAt: '2026-08-03T09:00:00Z', taskId: null }, growthReceipt: null };
    const adjustTx: any = {
      focusSession: { findFirst: jest.fn().mockResolvedValue(session), update: jest.fn().mockResolvedValue({ ...session, version: 2 }) },
      focusEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(adjustEvent), update: jest.fn() },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    };
    await (sync as any).applyMutation(adjustTx, 'user-1', {
      id: 'mutation-focus-adjust', kind: 'focussession.adjust', entityId: focusId, baseVersion: 1, baseValues: {}, occurredAt: new Date().toISOString(),
      payload: { ...adjustEvent.payload, idempotencyKey: 'adjust-key' },
    }, {});
    const directAdjust = new PrismaProductivityHabits({ $transaction: jest.fn(async (cb: any) => cb({ focusSession: { findFirst: jest.fn().mockResolvedValue(session) }, focusEvent: { findUnique: jest.fn().mockResolvedValue(adjustEvent) } })) } as never);
    await expect(directAdjust.adjustFocus('user-1', focusId, '2026-08-03T08:00:00Z', '2026-08-03T09:00:00Z', undefined, 1, 'adjust-key')).resolves.toEqual(expect.objectContaining({ id: focusId }));
  });
});
