import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import {
  AiJobType,
  CardStatus,
  CardType,
  CommitmentPolicyLevel,
  DeckColor,
  DeckIcon,
  GrowthAttributeMappingSlot,
  GrowthProgressKind,
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthSourceType,
  FocusMode,
  FocusPhase,
  FocusSessionStatus,
  HabitDirection,
  HabitOccurrenceStatus,
  HabitProgressSource,
  HabitScheduleType,
  HabitTargetType,
  Prisma,
  ReviewDirection,
  ReviewGrade,
  ReminderStatus,
  StudyMode,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import {
  ApplySyncMutationsResult,
  ISyncRepository,
  SyncChangesResult,
} from '@core/application/ports/out/sync-repository.port';
import { SrsSchedulerService } from '@core/application/use-cases/srs-scheduler.service';
import { ReviewDirection as DomainReviewDirection, ReviewGrade as DomainReviewGrade } from '@core/domain/enums';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { createUlid } from './ulid';
import { PrismaService } from './prisma.service';
import { mapCard, mapDeck } from './prisma.mappers';
import { deriveUrgency } from '@core/application/use-cases/productivity-rules';
import { awardGrowthActivityWithReceipt, reverseGrowthActivity, reverseGrowthActivityWithReceipt } from '@core/application/use-cases/growth-awards';
import { ensureHabitGrowthRule } from '@core/application/use-cases/ensure-habit-growth-rule';
import { ensureStarterSkills } from '@core/application/use-cases/ensure-starter-skills';
import { STARTER_SKILLS } from '@core/application/use-cases/growth-starter-skills';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import { focusActionSemanticPayload, focusAdjustSemanticPayload, focusStartSemanticPayload } from './focus-idempotency';
import { commitmentDefaults, commitmentFeatureEnabled, evaluateMissedCommitment, recoveryWindowOpen, reverseCommitmentPenalty } from '@core/application/use-cases/habit-commitments';
import {
  assertClientId,
  awardsArray,
  conflictingSyncFields,
  enumValue,
  fieldConflict,
  notFound,
  numberArray,
  optionalString,
  requiredInt,
  requiredString,
  stale,
  stringArray,
  syncValuesEqual,
  HABIT_ACTION_MARKER_PREFIX,
  validatedGrowthInt,
} from './prisma-sync.helpers';
export { conflictingSyncFields } from './prisma-sync.helpers';


export class PrismaSyncTransportMutations {
  readonly kinds: readonly string[] = ["deck.create","deck.update","deck.delete","deck.restore","card.create","card.update","card.delete","card.restore","cardimage.restore","ai.card_generation","ai.session_feedback","tasklist.create","tasklist.update","tasklist.delete"];
  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
      case 'deck.create':
        assertClientId(mutation.entityId);
        {
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
          await recordSyncChange(tx, userId, 'deck', deck.id, 'UPSERT', deck);
          return null;
        }
      case 'deck.update': {
        const deck = await tx.deck.findFirst({ where: { id: mutation.entityId, userId } });
        if (!deck) return notFound(mutation, 'deck');
        const conflict = fieldConflict(mutation, 'deck', deck);
        if (conflict) return conflict;
        const updated = await tx.deck.update({
          where: { id: deck.id },
          data: {
            title: optionalString(payload, 'title') ?? deck.title,
            description:
              payload.description === null ? null : (optionalString(payload, 'description') ?? deck.description),
            icon: payload.icon === undefined ? deck.icon : enumValue(DeckIcon, payload.icon, 'icon'),
            color: payload.color === undefined ? deck.color : enumValue(DeckColor, payload.color, 'color'),
            version: { increment: 1 },
          },
        });
        await recordSyncChange(tx, userId, 'deck', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'deck.delete': {
        const deck = await tx.deck.findFirst({ where: { id: mutation.entityId, userId } });
        if (!deck) return null;
        if (deck.isDefault) {
          throw new InvalidSyncMutationException('The default Inbox deck cannot be deleted');
        }
        if (mutation.baseVersion !== deck.version) return stale(mutation, 'deck', deck);
        await tx.deck.update({ where: { id: deck.id }, data: { archived: true, version: { increment: 1 } } });
        await recordSyncChange(tx, userId, 'deck', deck.id, 'DELETE', { id: deck.id });
        return null;
      }
      case 'deck.restore': {
        const deck = await tx.deck.findFirst({ where: { id: mutation.entityId, userId, archived: true } });
        if (!deck) return notFound(mutation, 'deck');
        const restored = await tx.deck.update({
          where: { id: deck.id },
          data: { archived: false, version: { increment: 1 } },
        });
        await recordSyncChange(tx, userId, 'deck', restored.id, 'UPSERT', restored);
        return null;
      }
      case 'card.create': {
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
          type === CardType.REVERSE
            ? [ReviewDirection.FRONT_TO_BACK, ReviewDirection.BACK_TO_FRONT]
            : [ReviewDirection.FRONT_TO_BACK];
        for (const direction of directions) {
          await tx.reviewState.upsert({
            where: { cardId_direction: { cardId: card.id, direction } },
            create: { id: createUlid(), userId, cardId: card.id, direction, dueAt: new Date(mutation.occurredAt) },
            update: {},
          });
        }
        await recordSyncChange(tx, userId, 'card', card.id, 'UPSERT', card);
        return null;
      }
      case 'card.update': {
        const card = await tx.card.findFirst({ where: { id: mutation.entityId, userId } });
        if (!card) return notFound(mutation, 'card');
        const conflict = fieldConflict(mutation, 'card', card);
        if (conflict) return conflict;
        const nextType = payload.type === undefined ? card.type : enumValue(CardType, payload.type, 'type');
        if (nextType === CardType.REVERSE && card.type !== CardType.REVERSE) {
          await tx.reviewState.upsert({
            where: { cardId_direction: { cardId: card.id, direction: ReviewDirection.BACK_TO_FRONT } },
            create: {
              id: createUlid(),
              userId,
              cardId: card.id,
              direction: ReviewDirection.BACK_TO_FRONT,
              dueAt: new Date(mutation.occurredAt),
            },
            update: {},
          });
        }
        if (nextType === CardType.BASIC && card.type === CardType.REVERSE) {
          await tx.reviewState.deleteMany({
            where: { userId, cardId: card.id, direction: ReviewDirection.BACK_TO_FRONT },
          });
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
        await recordSyncChange(tx, userId, 'card', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'card.delete': {
        const card = await tx.card.findFirst({ where: { id: mutation.entityId, userId } });
        if (!card) return null;
        if (mutation.baseVersion !== card.version) return stale(mutation, 'card', card);
        await tx.card.update({
          where: { id: card.id },
          data: { status: CardStatus.ARCHIVED, version: { increment: 1 } },
        });
        await recordSyncChange(tx, userId, 'card', card.id, 'DELETE', { id: card.id });
        return null;
      }
      case 'card.restore': {
        const card = await tx.card.findFirst({
          where: { id: mutation.entityId, userId, status: CardStatus.ARCHIVED, deck: { archived: false } },
        });
        if (!card) return notFound(mutation, 'card');
        const restored = await tx.card.update({
          where: { id: card.id },
          data: { status: CardStatus.ACTIVE, version: { increment: 1 } },
        });
        await recordSyncChange(tx, userId, 'card', restored.id, 'UPSERT', restored);
        return null;
      }
      case 'cardimage.restore': {
        const image = await tx.cardImage.findFirst({
          where: {
            id: mutation.entityId,
            userId,
            deletedAt: { not: null },
            card: { status: CardStatus.ACTIVE, deck: { archived: false } },
          },
        });
        if (!image) return notFound(mutation, 'cardimage');
        const restored = await tx.cardImage.update({ where: { id: image.id }, data: { deletedAt: null } });
        await recordSyncChange(tx, userId, 'cardimage', restored.id, 'UPSERT', restored);
        return null;
      }
      case 'ai.card_generation':
        assertClientId(mutation.entityId);
        {
          const job = await tx.aiJob.upsert({
            where: { id: mutation.entityId },
            create: {
              id: mutation.entityId,
              userId,
              type: AiJobType.CARD_GENERATION,
              input: { pastedText: requiredString(payload, 'pastedText') },
            },
            update: {},
          });
          await recordSyncChange(tx, userId, 'aijob', job.id, 'UPSERT', job);
          return null;
        }
      case 'ai.session_feedback':
        assertClientId(mutation.entityId);
        {
          const job = await tx.aiJob.upsert({
            where: { id: mutation.entityId },
            create: {
              id: mutation.entityId,
              userId,
              type: AiJobType.SESSION_FEEDBACK,
              input: { sessionId: requiredString(payload, 'sessionId') },
            },
            update: {},
          });
          await recordSyncChange(tx, userId, 'aijob', job.id, 'UPSERT', job);
          return null;
        }
      case 'tasklist.create': {
        assertClientId(mutation.entityId);
        const list = await tx.taskList.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            title: requiredString(payload, 'title'),
            description: optionalString(payload, 'description'),
            color: optionalString(payload, 'color') ?? 'TEAL',
          },
          update: {},
        });
        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'tasklist',
            entityId: list.id,
            operation: 'UPSERT',
            data: list as unknown as Prisma.InputJsonValue,
          },
        });
        return null;
      }
      case 'tasklist.update': {
        const list = await tx.taskList.findFirst({ where: { id: mutation.entityId, userId } });
        if (!list) return notFound(mutation, 'tasklist');
        const conflict = fieldConflict(mutation, 'tasklist', list);
        if (conflict) return conflict;
        const updated = await tx.taskList.update({
          where: { id: list.id },
          data: {
            title: optionalString(payload, 'title') ?? list.title,
            description:
              payload.description === null ? null : (optionalString(payload, 'description') ?? list.description),
            color: optionalString(payload, 'color') ?? list.color,
            version: { increment: 1 },
          },
        });
        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'tasklist',
            entityId: updated.id,
            operation: 'UPSERT',
            data: updated as unknown as Prisma.InputJsonValue,
          },
        });
        return null;
      }
      case 'tasklist.delete': {
        const list = await tx.taskList.findFirst({ where: { id: mutation.entityId, userId } });
        if (!list) return null;
        if (list.isDefault) throw new InvalidSyncMutationException('Default Inbox task list cannot be deleted');
        if (mutation.baseVersion !== undefined && mutation.baseVersion !== list.version)
          return stale(mutation, 'tasklist', list);
        const updated = await tx.taskList.update({
          where: { id: list.id },
          data: { archivedAt: new Date(), version: { increment: 1 } },
        });
        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'tasklist',
            entityId: updated.id,
            operation: 'DELETE',
            data: { id: list.id } as unknown as Prisma.InputJsonValue,
          },
        });
        return null;
      }
      default:
        return undefined;
    }
  }


}

