import { Injectable } from '@nestjs/common';
import { CardStatus } from '@core/domain/enums';
import { ITrashRepository } from '@core/application/ports/out/repositories.port';
import { Prisma } from '@prisma/client';
import { InvalidTrashOperationException } from '@core/domain/exceptions';
import { PrismaService } from './prisma.service';
import { mapCard, mapCardImage, mapDeck } from './prisma.mappers';
import { createUlid } from './ulid';
import { mapEntryToModel } from './prisma-journal.repository';
import { recordSyncChange } from './prisma-sync-mutation.shared';

const RECOVERED_CARDS_DECK_TITLE = 'Recovered Cards';
const RECOVERED_CARDS_DECK_DESCRIPTION = 'Cards preserved after their original deck was permanently deleted.';

function mapExpense(expense: any) {
  return {
    id: expense.id,
    userId: expense.userId,
    amount: new Prisma.Decimal(expense.amount).toFixed(2),
    category: expense.category?.name || 'Other',
    categoryId: expense.categoryId,
    merchant: expense.merchant,
    paymentMethod: expense.paymentMethod,
    expenseDate: expense.expenseDate,
    note: expense.note,
    version: expense.version,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    deletedAt: expense.deletedAt,
    deletedByDeviceId: expense.deletedByDeviceId,
  };
}

function mapExercise(exercise: any) {
  return {
    id: exercise.id,
    userId: exercise.userId,
    name: exercise.name,
    normalizedName: exercise.normalizedName,
    description: exercise.description,
    imageStorageKey: exercise.imageStorageKey,
    imageUrl: exercise.imageUrl,
    metricType: exercise.metricType,
    equipment: exercise.equipment,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    secondaryMuscleGroups: exercise.secondaryMuscleGroups || [],
    defaultWeightUnit: exercise.defaultWeightUnit,
    defaultRestSeconds: exercise.defaultRestSeconds,
    archivedAt: exercise.archivedAt,
    deletedAt: exercise.deletedAt,
    deletedByDeviceId: exercise.deletedByDeviceId,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
    version: exercise.version,
  };
}

function mapWorkout(workout: any) {
  return {
    id: workout.id,
    userId: workout.userId,
    title: workout.title || 'Workout',
    status: workout.status,
    startedAt: workout.startedAt || workout.createdAt,
    endedAt: workout.endedAt,
    durationMinutes: workout.durationMinutes,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
    version: workout.version,
    deletedAt: workout.deletedAt,
    deletedByDeviceId: workout.deletedByDeviceId,
    exercises: (workout.exercises || []).map((exercise: any) => ({
      id: exercise.id,
      workoutId: exercise.workoutId,
      workoutEntryId: exercise.workoutId,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      metricType: exercise.metricType,
      weightUnit: exercise.weightUnit,
      sortOrder: exercise.sortOrder,
      note: exercise.note,
      restSeconds: exercise.restSeconds,
      exercise: exercise.exercise ? mapExercise(exercise.exercise) : undefined,
      sets: (exercise.sets || []).map((set: any) => ({
        id: set.id,
        workoutExerciseId: set.workoutExerciseId,
        sortOrder: set.sortOrder,
        type: set.type,
        reps: set.reps,
        weight: set.weight == null ? null : Number(set.weight),
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
        rpe: set.rpe == null ? null : Number(set.rpe),
        completedAt: set.completedAt,
      })),
    })),
  };
}

async function findOrCreateRecoveredCardsDeck(tx: Prisma.TransactionClient, userId: string): Promise<{ id: string }> {
  const existing = await tx.deck.findFirst({
    where: { userId, title: RECOVERED_CARDS_DECK_TITLE, archived: false },
    select: { id: true },
  });
  if (existing) return existing;

  return tx.deck.create({
    data: {
      id: createUlid(),
      userId,
      title: RECOVERED_CARDS_DECK_TITLE,
      description: RECOVERED_CARDS_DECK_DESCRIPTION,
    },
    select: { id: true },
  });
}

@Injectable()
export class PrismaTrashRepository implements ITrashRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const [decks, cards, cardImages, tasks, journalEntries, expenses, gymWorkouts, gymExercises] = await Promise.all([
      this.prisma.deck.findMany({
        where: { userId, archived: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.card.findMany({
        where: { userId, status: CardStatus.ARCHIVED, deck: { archived: false } },
        include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, reviewStates: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.cardImage.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.task.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.journalEntry.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { weeklyReview: true, dailyReview: true, tags: { include: { tag: true } }, attachments: true },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { category: true },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.gymWorkout.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { exercises: { include: { exercise: true, sets: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.exerciseDefinition.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);
    return {
      decks: decks.map(mapDeck),
      cards: cards.map(mapCard),
      cardImages: cardImages.map(mapCardImage),
      tasks,
      journalEntries: journalEntries.map(mapEntryToModel),
      expenses: expenses.map(mapExpense),
      gymWorkouts: gymWorkouts.map(mapWorkout),
      gymExercises: gymExercises.map(mapExercise),
    };
  }

  async restoreDeck(userId: string, deckId: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId, archived: true } });
    if (!deck) return null;
    const restored = await this.prisma.deck.update({
      where: { id: deckId },
      data: { archived: false },
    });
    return mapDeck(restored);
  }

  async restoreCard(userId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId, status: CardStatus.ARCHIVED, deck: { archived: false } },
    });
    if (!card) return null;
    const restored = await this.prisma.card.update({
      where: { id: cardId },
      data: { status: CardStatus.ACTIVE },
      include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, reviewStates: true },
    });
    return mapCard(restored);
  }

  async restoreCardImage(userId: string, imageId: string) {
    const image = await this.prisma.cardImage.findFirst({
      where: {
        id: imageId,
        userId,
        deletedAt: { not: null },
        card: { status: CardStatus.ACTIVE, deck: { archived: false } },
      },
    });
    if (!image) return null;
    const restored = await this.prisma.cardImage.update({ where: { id: imageId }, data: { deletedAt: null } });
    return mapCardImage(restored);
  }

  async deleteDeck(userId: string, deckId: string) {
    return this.prisma.$transaction(async (tx) => {
      const deck = await tx.deck.findFirst({ where: { id: deckId, userId, archived: true, isDefault: false } });
      if (!deck) return null;
      const recoveryDeck = await findOrCreateRecoveredCardsDeck(tx, userId);
      await tx.card.updateMany({ where: { userId, deckId }, data: { deckId: recoveryDeck.id } });
      await tx.deck.delete({ where: { id: deckId } });
      return [];
    });
  }

  async deleteCard(userId: string, cardId: string) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.card.findFirst({ where: { id: cardId, userId, status: CardStatus.ARCHIVED } });
      if (!card) return null;
      const images = await tx.cardImage.findMany({ where: { userId, cardId } });
      await tx.card.delete({ where: { id: cardId } });
      return images.map(mapCardImage);
    });
  }

  async deleteCardImage(userId: string, imageId: string) {
    const image = await this.prisma.cardImage.findFirst({ where: { id: imageId, userId, deletedAt: { not: null } } });
    if (!image) return null;
    await this.prisma.cardImage.delete({ where: { id: imageId } });
    return mapCardImage(image);
  }

  async restoreTask(userId: string, taskId: string): Promise<boolean> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, userId, deletedAt: { not: null } } });
    if (!task) return false;
    await this.prisma.task.update({ where: { id: taskId }, data: { deletedAt: null } });
    return true;
  }

  async restoreJournalEntry(userId: string, entryId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.journalEntry.updateMany({ where: { id: entryId, userId, deletedAt: { not: null } }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } } });
      if (!updated.count) return null;
      const restored = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { weeklyReview: true, dailyReview: true, tags: { include: { tag: true } }, attachments: { where: { deletedAt: null } } } });
      await recordSyncChange(tx, userId, 'journalentry', entryId, 'UPSERT', restored);
      return mapEntryToModel(restored);
    });
  }

  async restoreExpense(userId: string, expenseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.updateMany({ where: { id: expenseId, userId, deletedAt: { not: null } }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } } });
      if (!updated.count) return null;
      const restored = await tx.expense.findUniqueOrThrow({ where: { id: expenseId }, include: { category: true } });
      await recordSyncChange(tx, userId, 'expense', expenseId, 'UPSERT', restored);
      return mapExpense(restored);
    });
  }

  async restoreGymWorkout(userId: string, workoutId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.gymWorkout.updateMany({ where: { id: workoutId, userId, deletedAt: { not: null } }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } } });
      if (!updated.count) return null;
      const restored = await tx.gymWorkout.findUniqueOrThrow({ where: { id: workoutId }, include: { exercises: { include: { exercise: true, sets: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } } });
      await recordSyncChange(tx, userId, 'gymworkout', workoutId, 'UPSERT', restored);
      return mapWorkout(restored);
    });
  }

  async restoreGymExercise(userId: string, exerciseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exerciseDefinition.updateMany({ where: { id: exerciseId, userId, deletedAt: { not: null } }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } } });
      if (!updated.count) return null;
      const restored = await tx.exerciseDefinition.findUniqueOrThrow({ where: { id: exerciseId } });
      await recordSyncChange(tx, userId, 'exercisedefinition', exerciseId, 'UPSERT', restored);
      return mapExercise(restored);
    });
  }

  async deleteJournalEntry(userId: string, entryId: string) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({ where: { id: entryId, userId, deletedAt: { not: null } }, include: { attachments: true } });
      if (!entry) return null;
      await tx.journalEntry.delete({ where: { id: entryId } });
      return entry.attachments.map((attachment) => ({ ...attachment, url: `/journal/attachments/${attachment.id}/file` }));
    });
  }

  async deleteExpense(userId: string, expenseId: string): Promise<boolean> {
    const deleted = await this.prisma.expense.deleteMany({ where: { id: expenseId, userId, deletedAt: { not: null } } });
    return deleted.count > 0;
  }

  async deleteGymWorkout(userId: string, workoutId: string): Promise<boolean> {
    const deleted = await this.prisma.gymWorkout.deleteMany({ where: { id: workoutId, userId, deletedAt: { not: null } } });
    return deleted.count > 0;
  }

  async deleteGymExercise(userId: string, exerciseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const exercise = await tx.exerciseDefinition.findFirst({ where: { id: exerciseId, userId, deletedAt: { not: null } } });
      if (!exercise) return null;
      const references = await tx.gymWorkoutExercise.count({ where: { exerciseId } });
      if (references > 0) throw new InvalidTrashOperationException('Exercise definition is referenced by a workout');
      await tx.exerciseDefinition.delete({ where: { id: exerciseId } });
      return exercise;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deleteTask(userId: string, taskId: string): Promise<boolean> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, userId, deletedAt: { not: null } } });
    if (!task) return false;
    await this.prisma.task.delete({ where: { id: taskId } });
    return true;
  }

  async purgeExpired(cutoff: Date) {
    const images = await this.prisma.cardImage.findMany({
      where: {
        OR: [{ deletedAt: { lt: cutoff } }, { card: { status: CardStatus.ARCHIVED, updatedAt: { lt: cutoff } } }],
      },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.cardImage.deleteMany({ where: { deletedAt: { lt: cutoff } } });
      await tx.card.deleteMany({ where: { status: CardStatus.ARCHIVED, updatedAt: { lt: cutoff } } });
      await tx.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
      const expiredDecks = await tx.deck.findMany({
        where: { archived: true, isDefault: false, updatedAt: { lt: cutoff } },
        select: { id: true, userId: true },
      });
      const deckIdsByUserId = new Map<string, string[]>();
      for (const deck of expiredDecks) {
        deckIdsByUserId.set(deck.userId, [...(deckIdsByUserId.get(deck.userId) ?? []), deck.id]);
      }
      for (const [userId, deckIds] of deckIdsByUserId) {
        const recoveryDeck = await findOrCreateRecoveredCardsDeck(tx, userId);
        await tx.card.updateMany({ where: { userId, deckId: { in: deckIds } }, data: { deckId: recoveryDeck.id } });
      }
      if (expiredDecks.length > 0) {
        await tx.deck.deleteMany({ where: { id: { in: expiredDecks.map((deck) => deck.id) } } });
      }
    });
    return images.map(mapCardImage);
  }
}
