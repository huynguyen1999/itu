import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import {
  GrowthSourceType,
  Prisma,
  ReviewDirection,
  ReviewGrade,
  StudyMode,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { SrsSchedulerService } from '@core/application/use-cases/srs-scheduler.service';
import { ReviewDirection as DomainReviewDirection, ReviewGrade as DomainReviewGrade } from '@core/domain/enums';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { awardGrowthActivityWithReceipt } from '@core/application/use-cases/growth-awards';
import {
  assertClientId,
  enumValue,
  notFound,
  optionalString,
  requiredInt,
  requiredString,
} from './prisma-sync.helpers';
export { conflictingSyncFields } from './prisma-sync.helpers';


export class PrismaSyncStudyMutations {
  readonly kinds: readonly string[] = ["session.start","review.create","session.complete"];
  constructor(private readonly scheduler: SrsSchedulerService) {}
  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
      case 'session.start': {
        assertClientId(mutation.entityId);
        const session = await tx.studySession.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            deckId: optionalString(payload, 'deckId'),
            mode: enumValue(StudyMode, payload.mode ?? StudyMode.DUE, 'mode'),
            startedAt: new Date(mutation.occurredAt),
          },
          update: {},
        });
        await recordSyncChange(tx, userId, 'studysession', session.id, 'UPSERT', session);
        return null;
      }
      case 'review.create':
        return this.applyReview(tx, userId, mutation);
      case 'session.complete': {
        const rating = requiredInt(payload, 'rating');
        if (rating < 1 || rating > 10) throw new InvalidSyncMutationException('rating must be between 1 and 10');
        const existing = await tx.studySession.findFirst({ where: { id: mutation.entityId, userId } });
        const logs = await tx.reviewLog.findMany({ where: { sessionId: mutation.entityId, userId } });
        await tx.studySession.updateMany({
          where: { id: mutation.entityId, userId, completedAt: null },
          data: {
            rating,
            completedAt: new Date(mutation.occurredAt),
            reviewed: logs.length,
            correct: logs.filter((log) => log.grade !== ReviewGrade.AGAIN).length,
          },
        });
        const session = await tx.studySession.findFirst({ where: { id: mutation.entityId, userId } });
        if (session) {
          if (existing && !existing.completedAt) {
            const growthReceipt = await this.awardStudyGrowth(tx, userId, session);
            if (growthReceipt) outcome.growthReceipt = growthReceipt;
          }
          await recordSyncChange(tx, userId, 'studysession', session.id, 'UPSERT', session);
        }
        return null;
      }
      default:
        return undefined;
    }
  }

  private async awardStudyGrowth(
    tx: Tx,
    userId: string,
    session: Prisma.StudySessionGetPayload<{}>,
  ) {
    if (!session.deckId || session.reviewed <= 0) return null;
    const deck = await tx.deck.findUnique({ where: { id: session.deckId } });
    if (!deck) return null;
    return awardGrowthActivityWithReceipt(
      tx,
      userId,
      GrowthSourceType.REVIEW_DECK,
      deck.id,
      deck.title,
      {
        studyMode: session.mode,
        reviewedCount: session.reviewed,
        correctCount: session.correct,
      },
      session.id,
      { reviewedCount: session.reviewed },
    );
  }

  async applyReview(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    const cardId = requiredString(payload, 'cardId');
    const sessionId = requiredString(payload, 'sessionId');
    const direction = enumValue(ReviewDirection, payload.direction, 'direction');
    const grade = enumValue(ReviewGrade, payload.grade, 'grade');
    const idempotencyKey = optionalString(payload, 'idempotencyKey');
    const rawUserAnswer = optionalString(payload, 'userAnswer');
    const userAnswer = rawUserAnswer?.trim() || null;
    const existing = await tx.reviewLog.findUnique({ where: { id: mutation.entityId } });
    const existingByKey = idempotencyKey
      ? await tx.reviewLog.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } })
      : null;
    const replay = existingByKey ?? existing;
    if (replay) {
      if (
        replay.sessionId !== sessionId ||
        replay.cardId !== cardId ||
        replay.direction !== direction ||
        replay.grade !== grade ||
        (replay.userAnswer ?? null) !== userAnswer ||
        (replay.responseMs ?? null) !== (typeof payload.responseMs === 'number' ? Math.round(payload.responseMs) : null)
      ) {
        throw new InvalidSyncMutationException('Review idempotency key was reused with a different payload');
      }
      return null;
    }
    const previous = await tx.reviewState.findUnique({ where: { cardId_direction: { cardId, direction } } });
    if (!previous || previous.userId !== userId) return notFound(mutation, 'reviewstate');
    const card = await tx.card.findFirst({
      where: { id: cardId, userId },
      include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!card) return notFound(mutation, 'card');
    const scheduled = this.scheduler.schedule(
      {
        ...previous,
        direction: direction as unknown as DomainReviewDirection,
      },
      grade as unknown as DomainReviewGrade,
      new Date(mutation.occurredAt),
    );
    await tx.reviewState.update({
      where: { id: previous.id },
      data: {
        dueAt: scheduled.state.dueAt,
        stability: scheduled.state.stability,
        difficulty: scheduled.state.difficulty,
        intervalDays: scheduled.state.intervalDays,
        lapseCount: scheduled.state.lapseCount,
        reviewCount: scheduled.state.reviewCount,
      },
    });
    await tx.reviewLog.create({
      data: {
        id: mutation.entityId,
        userId,
        sessionId,
        cardId,
        cardDeckId: card.deckId,
        cardPromptRichText: card.promptRichText,
        cardAnswerRichText: card.answerRichText,
        cardImages: card.images.map((image) => ({
          side: image.side,
          storageKey: image.storageKey,
          mimeType: image.mimeType,
          sortOrder: image.sortOrder,
          sizeBytes: image.sizeBytes,
        })),
        direction,
        grade,
        userAnswer,
        responseMs: typeof payload.responseMs === 'number' ? Math.round(payload.responseMs) : null,
        previousDueAt: previous.dueAt,
        nextDueAt: scheduled.nextDueAt,
        previousInterval: previous.intervalDays,
        nextInterval: scheduled.state.intervalDays,
        idempotencyKey,
        createdAt: new Date(mutation.occurredAt),
      },
    });
    const updatedState = await tx.reviewState.findUnique({ where: { id: previous.id } });
    const reviewLog = await tx.reviewLog.findUnique({ where: { id: mutation.entityId } });
    if (updatedState) await recordSyncChange(tx, userId, 'reviewstate', updatedState.id, 'UPSERT', updatedState);
    if (reviewLog) await recordSyncChange(tx, userId, 'reviewlog', reviewLog.id, 'UPSERT', reviewLog);
    return null;
  }

}
