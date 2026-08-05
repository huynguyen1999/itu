import { Injectable } from '@nestjs/common';
import {
  CardStatus,
  HabitProgressSource,
  Prisma,
  ReminderStatus,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import {
  ApplySyncMutationsResult,
  ISyncRepository,
  SyncChangesResult,
} from '@core/application/ports/out/sync-repository.port';
import { SrsSchedulerService } from '@core/application/use-cases/srs-scheduler.service';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { PrismaService } from './prisma.service';
import { PrismaSyncTransportMutations } from './prisma-sync-transport-mutations';
import { PrismaSyncStudyMutations } from './prisma-sync-study-mutations';
import { PrismaSyncFocusHabits } from './prisma-sync-focus-habits';
import { PrismaSyncTasks } from './prisma-sync-tasks';
import { PrismaSyncGrowthMutations } from './prisma-sync-growth-mutations';
import { TASK_SYNC_INCLUDE, Tx } from './prisma-sync-mutation.shared';
import { mapCard, mapDeck } from './prisma.mappers';
import { deriveUrgency } from '@core/application/use-cases/productivity-rules';
import {
  syncValuesEqual,
  HABIT_ACTION_MARKER_PREFIX,
} from './prisma-sync.helpers';
export { conflictingSyncFields } from './prisma-sync.helpers';

const SYNC_MUTATION_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 120_000,
} satisfies Parameters<PrismaService['$transaction']>[1];
export type RawSyncChange = {
  cursor: number;
  entityType: string;
  entityId: string;
  deleted: boolean;
  data: Prisma.JsonValue;
};
@Injectable()
export class PrismaSyncRepository implements ISyncRepository {
  private readonly transportMutations = new PrismaSyncTransportMutations();
  private readonly studyMutations: PrismaSyncStudyMutations;
  private readonly focusHabitsMutations = new PrismaSyncFocusHabits();
  private readonly taskMutations = new PrismaSyncTasks();
  private readonly growthMutations = new PrismaSyncGrowthMutations();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SrsSchedulerService,
  ) {
    this.studyMutations = new PrismaSyncStudyMutations(this.scheduler);
  }

  async applyMutations(userId: string, deviceId: string, mutations: SyncMutation[]): Promise<ApplySyncMutationsResult> {
    const conflicts: SyncConflict[] = [];
    const acknowledgedMutationIds: string[] = [];
    const aiJobsToEnqueue: Array<{ id: string; kind: string }> = [];
    const mutationOutcomes: ApplySyncMutationsResult['mutationOutcomes'] = [];

    for (const mutation of mutations) {
      const applied = await this.prisma.$transaction(async (tx) => {
        const mutationOutcome: { growthReceipt?: unknown } = {};
        const alreadyProcessed = await tx.syncMutation.findUnique({ where: { id: mutation.id } });
        if (alreadyProcessed) {
          if (alreadyProcessed.userId !== userId)
            throw new InvalidSyncMutationException('Mutation ID is already in use');
          if (
            alreadyProcessed.kind !== mutation.kind ||
            alreadyProcessed.entityId !== mutation.entityId ||
            !syncValuesEqual(alreadyProcessed.payload, mutation.payload)
          ) {
            throw new InvalidSyncMutationException('Mutation ID was reused with a different operation', {
              reason: 'MUTATION_ID_REUSED',
              mutationId: mutation.id,
            });
          }
          const storedOutcome =
            alreadyProcessed.result &&
            typeof alreadyProcessed.result === 'object' &&
            !Array.isArray(alreadyProcessed.result)
              ? (alreadyProcessed.result as Record<string, unknown>)
              : undefined;
          return { conflict: null, mutationOutcome: storedOutcome };
        }

        const conflict = await this.applyMutation(tx, userId, mutation, mutationOutcome);
        await tx.syncMutation.create({
          data: {
            id: mutation.id,
            userId,
            deviceId,
            kind: mutation.kind,
            entityId: mutation.entityId,
            payload: mutation.payload as Prisma.InputJsonValue,
            result: Object.keys(mutationOutcome).length ? (mutationOutcome as Prisma.InputJsonValue) : undefined,
            occurredAt: new Date(mutation.occurredAt),
          },
        });
        return {
          conflict,
          mutationOutcome: Object.keys(mutationOutcome).length ? mutationOutcome : undefined,
        };
      }, SYNC_MUTATION_TRANSACTION_OPTIONS);

      acknowledgedMutationIds.push(mutation.id);
      if (applied.mutationOutcome) {
        mutationOutcomes.push({ mutationId: mutation.id, ...applied.mutationOutcome });
      }
      if (mutation.kind.startsWith('ai.')) aiJobsToEnqueue.push({ id: mutation.entityId, kind: mutation.kind });
      if (applied.conflict) conflicts.push(applied.conflict);
    }

    return { acknowledgedMutationIds, conflicts, aiJobsToEnqueue, mutationOutcomes };
  }

  async changesSince(userId: string, cursor: number): Promise<SyncChangesResult> {
    const snapshotBoundary = await this.prisma.syncChange.findFirst({
      where: { userId },
      orderBy: { cursor: 'desc' },
      select: { cursor: true, createdAt: true },
    });
    const latestServerCursor = snapshotBoundary?.cursor ?? 0;
    if (cursor > 0 && cursor === latestServerCursor) {
      return {
        cursor: String(latestServerCursor),
        lastSyncTime: snapshotBoundary?.createdAt?.toISOString() || new Date().toISOString(),
        changes: [],
      };
    }
    const createSnapshot = shouldCreateSyncSnapshot(cursor, latestServerCursor);
    const incrementalChanges =
      createSnapshot
        ? []
        : await this.prisma.syncChange.findMany({
            where: { userId, cursor: { gt: cursor } },
            orderBy: { cursor: 'asc' },
            take: 2000,
          });
    const rawChanges =
      createSnapshot
        ? (await this.initialSnapshot(userId)).map((change) => ({
            cursor: latestServerCursor,
            entityType: change.entityType,
            entityId: change.entityId,
            deleted: false,
            data: change.data,
          }))
        : incrementalChanges.map((change) => ({
            cursor: change.cursor,
            entityType: change.entityType,
            entityId: change.entityId,
            deleted: change.operation === 'DELETE',
            data: change.data,
          }));
    const changes = await this.hydrateChanges(userId, rawChanges);
    const responseCursor =
      createSnapshot ? latestServerCursor : (incrementalChanges.at(-1)?.cursor ?? cursor);

    return {
      cursor: String(responseCursor),
      lastSyncTime: new Date().toISOString(),
      changes,
    };
  }

  private async hydrateChanges(userId: string, rawChanges: RawSyncChange[]) {
    const changes = coalesceSyncChanges(rawChanges);
    const ids = (type: string) =>
      changes.filter((change) => change.entityType === type && !change.deleted).map((change) => change.entityId);

    const deckIds = ids('deck');
    const [tasks, taskLists, habits, decks, cards, deckStats] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, id: { in: ids('task') }, deletedAt: null },
        include: {
          taskList: true,
          section: true,
          tags: { include: { tag: true } },
          reminders: { where: { status: { in: [ReminderStatus.SCHEDULED, ReminderStatus.SNOOZED] } } },
          children: { select: { id: true, status: true } },
        },
      }),
      this.prisma.taskList.findMany({ where: { userId, id: { in: ids('tasklist') } } }),
      this.prisma.habit.findMany({
        where: { userId, id: { in: ids('habit') } },
        include: {
          tags: { include: { tag: true } },
          reminders: true,
          focusPreset: true,
          timeBlock: true,
          checklistItems: { orderBy: { sortOrder: 'asc' } },
          taskTemplateConfig: true,
        },
      }),
      this.prisma.deck.findMany({ where: { userId, id: { in: deckIds }, archived: false } }),
      this.prisma.card.findMany({
        where: { userId, id: { in: ids('card') }, status: CardStatus.ACTIVE, deck: { archived: false } },
        include: {
          images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
          reviewStates: true,
        },
      }),
      this.deckStudyStats(userId, deckIds),
    ]);

    const now = new Date();
    const resources = new Map<string, unknown>();
    for (const task of tasks) resources.set(`task:${task.id}`, { ...task, ...deriveUrgency(task, now) });
    for (const taskList of taskLists) resources.set(`tasklist:${taskList.id}`, taskList);
    for (const habit of habits) resources.set(`habit:${habit.id}`, habit);
    for (const deck of decks) {
      const stats = deckStats.get(deck.id);
      resources.set(`deck:${deck.id}`, {
        ...mapDeck(deck),
        studyStats: {
          totalCards: stats?.totalCards ?? 0,
          toReviewCount: stats?.toReviewCount ?? 0,
          newCount: stats?.newCount ?? 0,
          dueCount: stats?.dueCount ?? 0,
          reviewedCount: stats?.reviewedCount ?? 0,
          lastStudiedAt: stats?.lastStudiedAt ?? null,
        },
      });
    }
    for (const card of cards) resources.set(`card:${card.id}`, mapCard(card));

    const completeTypes = new Set(['task', 'tasklist', 'habit', 'deck', 'card']);
    return changes.map((change) => {
      const key = `${change.entityType}:${change.entityId}`;
      const resource = change.deleted ? null : resources.get(key);
      const complete = change.deleted || (completeTypes.has(change.entityType) && resource !== undefined);
      return {
        cursor: change.cursor,
        resourceType: change.entityType,
        resourceId: change.entityId,
        operation:
          change.deleted || (completeTypes.has(change.entityType) && resource === undefined)
            ? ('DELETE' as const)
            : ('UPSERT' as const),
        resource: completeTypes.has(change.entityType) ? (resource ?? null) : change.data,
        complete,
      };
    });
  }

  private async deckStudyStats(userId: string, deckIds: string[]) {
    type CountRow = { deckId: string; _count: { _all: number } };
    type Stats = {
      totalCards: number;
      toReviewCount: number;
      newCount: number;
      dueCount: number;
      reviewedCount: number;
      lastStudiedAt: Date | null;
    };
    if (deckIds.length === 0) return new Map<string, Stats>();
    const now = new Date();
    const baseWhere = { userId, deckId: { in: deckIds }, status: CardStatus.ACTIVE, deck: { archived: false } };
    const [totals, toReview, newCards, dueCards, reviewedCards, lastStudied] = await Promise.all([
      this.prisma.card.groupBy({ by: ['deckId'], where: baseWhere, _count: { _all: true } }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: { ...baseWhere, reviewStates: { some: { dueAt: { lte: now } } } },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: { ...baseWhere, reviewStates: { every: { reviewCount: 0 } } },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: { ...baseWhere, reviewStates: { some: { dueAt: { lte: now }, reviewCount: { gt: 0 } } } },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: { ...baseWhere, reviewStates: { some: { reviewCount: { gt: 0 } } } },
        _count: { _all: true },
      }),
      this.prisma.studySession.groupBy({
        by: ['deckId'],
        where: { userId, deckId: { in: deckIds }, completedAt: { not: null }, reviewed: { gt: 0 } },
        _max: { completedAt: true },
      }),
    ]);
    const counts = (rows: CountRow[]) => new Map(rows.map((row) => [row.deckId, row._count._all]));
    const total = counts(totals);
    const review = counts(toReview);
    const fresh = counts(newCards);
    const due = counts(dueCards);
    const reviewed = counts(reviewedCards);
    const studied = new Map(lastStudied.map((row) => [row.deckId!, row._max.completedAt]));
    return new Map(
      deckIds.map((deckId) => [
        deckId,
        {
          totalCards: total.get(deckId) ?? 0,
          toReviewCount: review.get(deckId) ?? 0,
          newCount: fresh.get(deckId) ?? 0,
          dueCount: due.get(deckId) ?? 0,
          reviewedCount: reviewed.get(deckId) ?? 0,
          lastStudiedAt: studied.get(deckId) ?? null,
        },
      ]),
    );
  }

  async currentCursor(userId: string): Promise<string> {
    const latest = await this.prisma.syncChange.findFirst({
      where: { userId },
      orderBy: { cursor: 'desc' },
      select: { cursor: true },
    });
    return String(latest?.cursor ?? 0);
  }

  private async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null> {
    const handler = [
      this.transportMutations,
      this.studyMutations,
      this.focusHabitsMutations,
      this.taskMutations,
      this.growthMutations,
    ].find((candidate) => candidate.kinds.includes(mutation.kind));
    if (!handler) throw new InvalidSyncMutationException(`Unsupported sync mutation kind: ${mutation.kind}`);
    const conflict = await handler.applyMutation(tx, userId, mutation, outcome);
    if (conflict === undefined) throw new InvalidSyncMutationException(`Unsupported sync mutation kind: ${mutation.kind}`);
    return conflict;
  }

  private async applyReview(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    return this.studyMutations.applyReview(tx, userId, mutation);
  }

  private async initialSnapshot(userId: string) {
    const [
      decks,
      cards,
      images,
      reviewStates,
      sessions,
      reviewLogs,
      aiJobs,
      feedback,
      taskLists,
      tasks,
      taskTags,
      taskSections,
      taskReminders,
      focusPresets,
      focusPolicies,
      focusSessions,
      habits,
      habitOccurrences,
      habitTimeBlocks,
      habitTaskTemplates,
      habitProgressLogs,
      habitCommitmentPolicies,
      commitmentPenalties,
      growthSkills,
      growthAttributeMappings,
      growthEarningRules,
      growthLedgerEntries,
      growthShopRewards,
      growthRewardRedemptions,
      growthItemCategories,
      growthInventoryTransactions,
    ] = await Promise.all([
      this.prisma.deck.findMany({ where: { userId, archived: false } }),
      this.prisma.card.findMany({ where: { userId, status: CardStatus.ACTIVE, deck: { archived: false } } }),
      this.prisma.cardImage.findMany({
        where: { userId, deletedAt: null, card: { status: CardStatus.ACTIVE, deck: { archived: false } } },
      }),
      this.prisma.reviewState.findMany({ where: { userId } }),
      this.prisma.studySession.findMany({ where: { userId } }),
      this.prisma.reviewLog.findMany({ where: { userId } }),
      this.prisma.aiJob.findMany({ where: { userId } }),
      this.prisma.aiSessionFeedback.findMany({ where: { userId } }),
      this.prisma.taskList.findMany({ where: { userId } }),
      this.prisma.task.findMany({ where: { userId }, include: TASK_SYNC_INCLUDE }),
      this.prisma.taskTag.findMany({ where: { userId } }),
      this.prisma.taskSection.findMany({ where: { userId } }),
      this.prisma.taskReminder.findMany({ where: { userId } }),
      this.prisma.focusPreset.findMany({ where: { userId } }),
      this.prisma.focusPolicy.findMany({ where: { userId } }),
      this.prisma.focusSession.findMany({ where: { userId } }),
      this.prisma.habit.findMany({ where: { userId } }),
      this.prisma.habitOccurrence.findMany({
        where: { habit: { userId } },
        include: { checkIn: true, checklistItems: true },
      }),
      this.prisma.habitTimeBlock.findMany({ where: { userId } }),
      this.prisma.habitTaskTemplate.findMany({ where: { userId } }),
      this.prisma.habitProgressLog.findMany({
        where: {
          occurrence: { habit: { userId } },
          NOT: {
            source: HabitProgressSource.MANUAL,
            adjusted: true,
            rewardEligible: false,
            note: { startsWith: HABIT_ACTION_MARKER_PREFIX },
          },
        },
      }),
      this.prisma.habitCommitmentPolicy.findMany({ where: { userId } }),
      this.prisma.growthCommitmentPenalty.findMany({ where: { userId } }),
      this.prisma.growthSkill.findMany({ where: { userId } }),
      this.prisma.growthAttributeMapping.findMany({
        where: { userId },
        include: {
          skill: { select: { id: true, name: true, kind: true, archivedAt: true } },
          attribute: { select: { id: true, name: true, kind: true, icon: true, color: true, archivedAt: true } },
        },
        orderBy: [{ skillId: 'asc' }, { slot: 'asc' }],
      }),
      this.prisma.growthEarningRule.findMany({
        where: { userId },
        include: { skillAwards: true, itemAwards: true },
      }),
      this.prisma.growthLedgerEntry.findMany({ where: { userId } }),
      this.prisma.growthShopReward.findMany({ where: { userId } }),
      this.prisma.growthRewardRedemption.findMany({ where: { userId } }),
      this.prisma.growthItemCategory.findMany({ where: { userId } }),
      this.prisma.growthInventoryTransaction.findMany({ where: { userId } }),
    ]);
    const rows: Array<{ entityType: string; entityId: string; deleted: false; data: Prisma.JsonValue }> = [];
    const add = (entityType: string, values: Array<{ id: string }>) => {
      for (const value of values)
        rows.push({ entityType, entityId: value.id, deleted: false, data: value as Prisma.JsonValue });
    };
    add('deck', decks);
    add('card', cards);
    add('cardimage', images);
    add('reviewstate', reviewStates);
    add('studysession', sessions);
    add('reviewlog', reviewLogs);
    add('aijob', aiJobs);
    add('aisessionfeedback', feedback);
    add('tasklist', taskLists);
    add('task', tasks);
    add('tasktag', taskTags);
    add('tasksection', taskSections);
    add('taskreminder', taskReminders);
    add('focuspreset', focusPresets);
    add('focuspolicy', focusPolicies);
    add('focussession', focusSessions);
    add('habit', habits);
    add('habitoccurrence', habitOccurrences);
    add('habittimeblock', habitTimeBlocks);
    add('habittasktemplate', habitTaskTemplates);
    add('habitprogresslog', habitProgressLogs);
    add('habitcommitmentpolicy', habitCommitmentPolicies);
    add('growthcommitmentpenalty', commitmentPenalties);
    add('growthskill', growthSkills);
    const mappingsBySkill = new Map<string, Prisma.JsonValue[]>();
    for (const mapping of growthAttributeMappings) {
      const mappings = mappingsBySkill.get(mapping.skillId) ?? [];
      mappings.push(mapping as unknown as Prisma.JsonValue);
      mappingsBySkill.set(mapping.skillId, mappings);
    }
    for (const [skillId, mappings] of mappingsBySkill) {
      rows.push({ entityType: 'growthattributemapping', entityId: skillId, deleted: false, data: mappings });
    }
    add('growthearningrule', growthEarningRules);
    add('growthledgerentry', growthLedgerEntries);
    add('growthshopreward', growthShopRewards);
    add('growthrewardredemption', growthRewardRedemptions);
    add('growthitemcategory', growthItemCategories);
    add('growthinventorytransaction', growthInventoryTransactions);
    return rows;
  }
}
export function shouldCreateSyncSnapshot(cursor: number, latestServerCursor: number): boolean {
  return cursor === 0 || cursor > latestServerCursor;
}

export function coalesceSyncChanges(changes: RawSyncChange[]): RawSyncChange[] {
  const coalesced = new Map<string, RawSyncChange>();
  for (const change of changes) coalesced.set(`${change.entityType}:${change.entityId}`, change);
  return [...coalesced.values()].sort((left, right) => left.cursor - right.cursor);
}
