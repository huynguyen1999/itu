import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DeckColor, DeckIcon, ScheduledJobType } from '@core/domain/enums';
import { AUTH_CONSTANTS } from '@core/application/constants/app.constants';
import { IUserRepository } from '@core/application/ports/out/repositories.port';
import type {
  CreateUserData,
  UpdateUserProfileData,
  UpsertGoogleUserData,
} from '@core/application/ports/out/repository-types.port';
import { PrismaService } from './prisma.service';
import { mapUser } from './prisma.mappers';
import { createUlid } from './ulid';
import { ensureStarterSkills } from '@core/application/use-cases/ensure-starter-skills';
import { ONBOARDING_STATE } from '@core/application/constants/productivity.constants';

const DEFAULT_DECK = {
  title: 'Inbox',
  description: 'Cards waiting to be organized',
  icon: DeckIcon.INBOX,
  color: DeckColor.SLATE,
  isDefault: true,
} as const;

const DEFAULT_TASK_LIST = {
  title: 'Inbox',
  color: 'TEAL',
  isDefault: true,
} as const;

const STARTER_TASKS = [
  'Create a new task',
  'Try more task actions',
  'Explore the task details page',
  'Complete your first task',
] as const;

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : null;
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? mapUser(user) : null;
  }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    return user ? mapUser(user) : null;
  }

  async findByIdentifier(identifier: string) {
    const trimmed = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: trimmed, mode: 'insensitive' } },
          { username: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
    });
    return user ? mapUser(user) : null;
  }

  async create(data: CreateUserData) {
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          ...data,
          id: createUlid(),
        },
      });
      await this.createInitialUserContent(tx, createdUser.id);
      return createdUser;
    });
    return mapUser(user);
  }

  async updateProfile(userId: string, data: UpdateUserProfileData) {
    const existing = await this.findById(userId);
    if (!existing) return null;
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return mapUser(user);
  }

  async updatePassword(userId: string, passwordHash: string) {
    const existing = await this.findById(userId);
    if (!existing) return null;
    const user = await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return mapUser(user);
  }

  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const [
      decks,
      cards,
      reviewStates,
      studySessions,
      reviewLogs,
      aiFeedback,
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
      growthSkills,
      growthEarningRules,
      growthLedgerEntries,
      growthShopRewards,
      growthRewardRedemptions,
      growthItemCategories,
      growthInventoryTransactions,
    ] = await Promise.all([
      this.prisma.deck.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.card.findMany({
        where: { userId },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reviewState.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.studySession.findMany({ where: { userId }, orderBy: { startedAt: 'asc' } }),
      this.prisma.reviewLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.aiSessionFeedback.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.taskList.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.task.findMany({
        where: { userId },
        include: { tags: true, occurrences: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.taskTag.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.taskSection.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.taskReminder.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.focusPreset.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.focusPolicy.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.focusSession.findMany({
        where: { userId },
        include: { events: true, interruptions: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.habit.findMany({
        where: { userId },
        include: { tags: true, reminders: true, checklistItems: true },
      }),
      this.prisma.habitOccurrence.findMany({
        where: { habit: { userId } },
        include: { checkIn: true, progressLogs: true, checklistItems: true },
        orderBy: { occurrenceDate: 'asc' },
      }),
      this.prisma.habitTimeBlock.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.habitTaskTemplate.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.growthSkill.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.growthEarningRule.findMany({
        where: { userId },
        include: { skillAwards: true, itemAwards: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.growthLedgerEntry.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.growthShopReward.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.growthRewardRedemption.findMany({ where: { userId }, orderBy: { redeemedAt: 'asc' } }),
      this.prisma.growthItemCategory.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.growthInventoryTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      exportedAt: new Date(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      decks,
      cards,
      reviewStates,
      studySessions,
      reviewLogs,
      aiFeedback,
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
      growthSkills,
      growthEarningRules,
      growthLedgerEntries,
      growthShopRewards,
      growthRewardRedemptions,
      growthItemCategories,
      growthInventoryTransactions,
    };
  }

  async delete(userId: string) {
    const existing = await this.findById(userId);
    if (!existing) return false;
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: new Date(), deletionScheduledFor: new Date() },
    });
    return true;
  }

  async scheduleDeletion(userId: string, runAt: Date) {
    const existing = await this.findById(userId);
    if (!existing) return null;
    const jobId = createUlid();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: new Date(), deletionScheduledFor: runAt },
      });
      await tx.scheduledJob.create({
        data: {
          id: jobId,
          userId,
          type: ScheduledJobType.ACCOUNT_DELETE,
          payload: { userId },
          runAt,
        },
      });
    });
    return { userId, jobId, runAt };
  }

  async hardDelete(userId: string) {
    const existing = await this.findById(userId);
    if (!existing) return false;
    await this.prisma.$transaction(async (tx) => {
      await tx.card.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
    return true;
  }

  async upsertGoogleUser(data: UpsertGoogleUserData) {
    const identity = await this.prisma.oAuthIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: AUTH_CONSTANTS.googleProvider, providerUserId: data.providerUserId },
      },
      include: { user: true },
    });
    if (identity) return mapUser(identity.user);

    const existingUser = await this.prisma.user.findUnique({ where: { email: data.email } });
    const user = await this.prisma.$transaction(async (tx) => {
      const linkedUser =
        existingUser ??
        (await tx.user.create({
          data: {
            id: createUlid(),
            email: data.email,
            displayName: data.displayName,
          },
        }));
      if (!existingUser) {
        await this.createInitialUserContent(tx, linkedUser.id);
      }
      await tx.oAuthIdentity.create({
        data: {
          id: createUlid(),
          userId: linkedUser.id,
          provider: AUTH_CONSTANTS.googleProvider,
          providerUserId: data.providerUserId,
        },
      });
      return linkedUser;
    });
    return mapUser(user);
  }

  private async createInitialUserContent(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.deck.create({
      data: {
        ...DEFAULT_DECK,
        id: createUlid(),
        userId,
      },
    });

    const taskList = await tx.taskList.create({
      data: {
        ...DEFAULT_TASK_LIST,
        id: createUlid(),
        userId,
      },
    });

    await tx.task.createMany({
      data: STARTER_TASKS.map((title, index) => ({
        id: createUlid(),
        userId,
        taskListId: taskList.id,
        title,
        descriptionMarkdown: '',
        sortOrder: index + 1,
      })),
    });

    const cycle = await tx.growthCycle.create({ data: { id: createUlid(), userId } });
    await tx.growthProfile.create({
      data: {
        id: createUlid(),
        userId,
        activeCycleId: cycle.id,
        onboardingState: ONBOARDING_STATE.COMPLETED,
      },
    });
    await ensureStarterSkills(tx, userId, cycle.id);
  }
}
