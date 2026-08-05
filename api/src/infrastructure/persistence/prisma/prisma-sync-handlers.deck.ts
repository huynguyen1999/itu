import { CardStatus, CardType, DeckColor, DeckIcon } from '@prisma/client';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { createUlid } from './ulid';
import {
  assertClientId,
  enumValue,
  fieldConflict,
  notFound,
  optionalString,
  requiredString,
  stale,
  stringArray,
} from './prisma-sync.helpers';
import { MutationHandlerContext, recordChange, SyncMutationHandler } from './prisma-sync-handler.port';

// ─── Deck ────────────────────────────────────────────────────────────────────

const deckCreate: SyncMutationHandler = {
  kinds: ['deck.create'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    assertClientId(mutation.entityId);
    const deck = await tx.deck.upsert({
      where: { id: mutation.entityId },
      create: {
        id: mutation.entityId,
        userId,
        title: requiredString(payload, 'title'),
        description: optionalString(payload, 'description'),
        icon: payload.icon ? enumValue(DeckIcon, payload.icon, 'icon') : DeckIcon.BOOK,
        color: payload.color ? enumValue(DeckColor, payload.color, 'color') : DeckColor.TEAL,
      },
      update: {},
    });
    await recordChange(tx, userId, 'deck', deck.id, 'UPSERT', deck);
    return null;
  },
};

const deckUpdate: SyncMutationHandler = {
  kinds: ['deck.update'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    const deck = await tx.deck.findFirst({ where: { id: mutation.entityId, userId } });
    if (!deck) return notFound(mutation, 'deck');
    const conflict = fieldConflict(mutation, 'deck', deck);
    if (conflict) return conflict;
    const updated = await tx.deck.update({
      where: { id: deck.id },
      data: {
        title: optionalString(payload, 'title') ?? deck.title,
        description: payload.description === null ? null : (optionalString(payload, 'description') ?? deck.description),
        icon: payload.icon === undefined ? deck.icon : enumValue(DeckIcon, payload.icon, 'icon'),
        color: payload.color === undefined ? deck.color : enumValue(DeckColor, payload.color, 'color'),
        version: { increment: 1 },
      },
    });
    await recordChange(tx, userId, 'deck', updated.id, 'UPSERT', updated);
    return null;
  },
};

const deckDelete: SyncMutationHandler = {
  kinds: ['deck.delete'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const deck = await tx.deck.findFirst({ where: { id: mutation.entityId, userId } });
    if (!deck) return null;
    if (deck.isDefault) throw new InvalidSyncMutationException('The default Inbox deck cannot be deleted');
    if (mutation.baseVersion !== deck.version) return stale(mutation, 'deck', deck);
    await tx.deck.update({ where: { id: deck.id }, data: { archived: true, version: { increment: 1 } } });
    await recordChange(tx, userId, 'deck', deck.id, 'DELETE', { id: deck.id });
    return null;
  },
};

const deckRestore: SyncMutationHandler = {
  kinds: ['deck.restore'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const deck = await tx.deck.findFirst({ where: { id: mutation.entityId, userId, archived: true } });
    if (!deck) return notFound(mutation, 'deck');
    const restored = await tx.deck.update({
      where: { id: deck.id },
      data: { archived: false, version: { increment: 1 } },
    });
    await recordChange(tx, userId, 'deck', restored.id, 'UPSERT', restored);
    return null;
  },
};

// ─── Card ────────────────────────────────────────────────────────────────────

const cardCreate: SyncMutationHandler = {
  kinds: ['card.create'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    assertClientId(mutation.entityId);
    const deckId = requiredString(payload, 'deckId');
    const deck = await tx.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) return notFound(mutation, 'deck');
    const type = enumValue(CardType, payload.type, 'type');
    const card = await tx.card.upsert({
      where: { id: mutation.entityId },
      create: {
        id: mutation.entityId,
        userId,
        deckId,
        type,
        promptRichText: requiredString(payload, 'promptRichText'),
        answerRichText: requiredString(payload, 'answerRichText'),
        tags: stringArray(payload, 'tags'),
      },
      update: {},
    });
    const directions =
      type === CardType.REVERSE ? (['FRONT_TO_BACK', 'BACK_TO_FRONT'] as const) : (['FRONT_TO_BACK'] as const);
    for (const direction of directions) {
      await tx.reviewState.upsert({
        where: { cardId_direction: { cardId: card.id, direction } },
        create: { id: createUlid(), userId, cardId: card.id, direction, dueAt: new Date(mutation.occurredAt) },
        update: {},
      });
    }
    await recordChange(tx, userId, 'card', card.id, 'UPSERT', card);
    return null;
  },
};

const cardUpdate: SyncMutationHandler = {
  kinds: ['card.update'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    const card = await tx.card.findFirst({ where: { id: mutation.entityId, userId } });
    if (!card) return notFound(mutation, 'card');
    const conflict = fieldConflict(mutation, 'card', card);
    if (conflict) return conflict;
    const nextType = payload.type === undefined ? card.type : enumValue(CardType, payload.type, 'type');
    if (nextType === 'REVERSE' && card.type !== 'REVERSE') {
      await tx.reviewState.upsert({
        where: { cardId_direction: { cardId: card.id, direction: 'BACK_TO_FRONT' } },
        create: {
          id: createUlid(),
          userId,
          cardId: card.id,
          direction: 'BACK_TO_FRONT',
          dueAt: new Date(mutation.occurredAt),
        },
        update: {},
      });
    }
    if (nextType === 'BASIC' && card.type === 'REVERSE') {
      await tx.reviewState.deleteMany({ where: { userId, cardId: card.id, direction: 'BACK_TO_FRONT' } });
    }
    const updated = await tx.card.update({
      where: { id: card.id },
      data: {
        type: nextType,
        promptRichText: optionalString(payload, 'promptRichText') ?? card.promptRichText,
        answerRichText: optionalString(payload, 'answerRichText') ?? card.answerRichText,
        tags: payload.tags === undefined ? card.tags : stringArray(payload, 'tags'),
        version: { increment: 1 },
      },
    });
    if (payload.resetReviewDate === true) {
      await tx.reviewState.updateMany({
        where: { userId, cardId: card.id },
        data: { dueAt: new Date(mutation.occurredAt) },
      });
    }
    await recordChange(tx, userId, 'card', updated.id, 'UPSERT', updated);
    return null;
  },
};

const cardDelete: SyncMutationHandler = {
  kinds: ['card.delete'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const card = await tx.card.findFirst({ where: { id: mutation.entityId, userId } });
    if (!card) return null;
    if (mutation.baseVersion !== card.version) return stale(mutation, 'card', card);
    await tx.card.update({ where: { id: card.id }, data: { status: CardStatus.ARCHIVED, version: { increment: 1 } } });
    await recordChange(tx, userId, 'card', card.id, 'DELETE', { id: card.id });
    return null;
  },
};

const cardRestore: SyncMutationHandler = {
  kinds: ['card.restore'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const card = await tx.card.findFirst({
      where: { id: mutation.entityId, userId, status: CardStatus.ARCHIVED, deck: { archived: false } },
    });
    if (!card) return notFound(mutation, 'card');
    const restored = await tx.card.update({
      where: { id: card.id },
      data: { status: CardStatus.ACTIVE, version: { increment: 1 } },
    });
    await recordChange(tx, userId, 'card', restored.id, 'UPSERT', restored);
    return null;
  },
};

const cardImageRestore: SyncMutationHandler = {
  kinds: ['cardimage.restore'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const image = await tx.cardImage.findFirst({
      where: {
        id: mutation.entityId,
        userId,
        deletedAt: { not: null },
        card: { status: 'ACTIVE' as any, deck: { archived: false } },
      },
    });
    if (!image) return notFound(mutation, 'cardimage');
    const restored = await tx.cardImage.update({ where: { id: image.id }, data: { deletedAt: null } });
    await recordChange(tx, userId, 'cardimage', restored.id, 'UPSERT', restored);
    return null;
  },
};

// ─── Study Session ───────────────────────────────────────────────────────────

const sessionStart: SyncMutationHandler = {
  kinds: ['session.start'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    assertClientId(mutation.entityId);
    const session = await tx.studySession.upsert({
      where: { id: mutation.entityId },
      create: {
        id: mutation.entityId,
        userId,
        deckId: optionalString(payload, 'deckId'),
        mode: 'DUE' as any,
        startedAt: new Date(mutation.occurredAt),
      },
      update: {},
    });
    await recordChange(tx, userId, 'studysession', session.id, 'UPSERT', session);
    return null;
  },
};

const sessionComplete: SyncMutationHandler = {
  kinds: ['session.complete'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    const rating = payload.rating as number;
    if (typeof rating !== 'number' || rating < 1 || rating > 10)
      throw new InvalidSyncMutationException('rating must be between 1 and 10');
    const logs = await tx.reviewLog.findMany({ where: { sessionId: mutation.entityId, userId } });
    await tx.studySession.updateMany({
      where: { id: mutation.entityId, userId, completedAt: null },
      data: {
        rating,
        completedAt: new Date(mutation.occurredAt),
        reviewed: logs.length,
        correct: logs.filter((log) => log.grade !== 'AGAIN').length,
      },
    });
    const session = await tx.studySession.findFirst({ where: { id: mutation.entityId, userId } });
    if (session) await recordChange(tx, userId, 'studysession', session.id, 'UPSERT', session);
    return null;
  },
};

const aiCardGeneration: SyncMutationHandler = {
  kinds: ['ai.card_generation'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    assertClientId(mutation.entityId);
    const job = await tx.aiJob.upsert({
      where: { id: mutation.entityId },
      create: {
        id: mutation.entityId,
        userId,
        type: 'CARD_GENERATION' as any,
        input: { pastedText: requiredString(payload, 'pastedText') },
      },
      update: {},
    });
    await recordChange(tx, userId, 'aijob', job.id, 'UPSERT', job);
    return null;
  },
};

const aiSessionFeedback: SyncMutationHandler = {
  kinds: ['ai.session_feedback'],
  async handle(ctx: MutationHandlerContext) {
    const { tx, userId, mutation } = ctx;
    const payload = mutation.payload;
    assertClientId(mutation.entityId);
    const job = await tx.aiJob.upsert({
      where: { id: mutation.entityId },
      create: {
        id: mutation.entityId,
        userId,
        type: 'SESSION_FEEDBACK' as any,
        input: { sessionId: requiredString(payload, 'sessionId') },
      },
      update: {},
    });
    await recordChange(tx, userId, 'aijob', job.id, 'UPSERT', job);
    return null;
  },
};

/** All deck/card/study/AI handlers registered in this module. */
export const deckCardHandlers: SyncMutationHandler[] = [
  deckCreate,
  deckUpdate,
  deckDelete,
  deckRestore,
  cardCreate,
  cardUpdate,
  cardDelete,
  cardRestore,
  cardImageRestore,
  sessionStart,
  sessionComplete,
  aiCardGeneration,
  aiSessionFeedback,
];
