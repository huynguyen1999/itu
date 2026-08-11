import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';

export interface TaskPreferences {
  defaultDate: 'NONE' | 'TODAY' | 'TOMORROW';
  defaultPriority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  defaultTaskListId: string;
}

export interface FocusPreferences {
  workDurationMinutes: number;
  shortBreakDurationMinutes: number;
  longBreakDurationMinutes: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  countOvertime: boolean;
  completionSound: string;
  desktopNotification: boolean;
}

export interface HabitPreferences {
  dayRolloverCutoffHour: number;
  weekStartDay: 'MONDAY' | 'SUNDAY';
}

export interface MatrixPreferences {
  urgentDueWithinDays: number;
  urgentPriorities: Array<'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'>;
  importantPriorities: Array<'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'>;
}

export interface GrowthPreferences {
  celebrationIntensity: 'OFF' | 'SUBTLE' | 'FULL';
  rewardConfirmationThreshold: number;
  showRewardReceipts: boolean;
  showAnimations: boolean;
}

export interface LearnPreferences {
  reviewOrder: 'DUE_DATE' | 'RANDOM' | 'PRIORITY';
  dailyReviewLimit: number;
  dailyNewCardLimit: number;
}

export interface JournalPreferences {
  defaultEditorMode: 'EDIT' | 'LIVE' | 'PREVIEW';
  autoCreateDailyNote: boolean;
  autoOpenTodayNote: boolean;
  weekStartDay: 'MONDAY' | 'SUNDAY';
  autoCreateWeeklyReview: boolean;
}

export interface MoneyPreferences {
  defaultCurrency: 'VND' | 'USD';
  defaultTransactionType: 'EXPENSE' | 'INCOME';
  rememberPaymentMethod: boolean;
  merchantSuggestionsEnabled: boolean;
  budgetWarningThreshold: number;
  budgetAlertsEnabled: boolean;
}

export interface GymPreferences {
  weightUnit: 'KG' | 'LBS';
  distanceUnit: 'KM' | 'MI';
  defaultRestSeconds: number;
  autoStartRestTimer: boolean;
  previousPerformanceMode: 'EXERCISE' | 'ROUTINE';
  showRpe: boolean;
  weeklyWorkoutGoal?: number;
}

export type BudgetPreferences = MoneyPreferences;

export interface UsagePreferences {
  trackingEnabled: boolean;
  websiteTrackingEnabled: boolean;
  retentionDays: number;
  idleThresholdSeconds: number;
  excludedBundleIds: string[];
}

export const MAX_EXCLUDED_BUNDLE_IDS = 100;
export const MAX_EXCLUDED_BUNDLE_ID_LENGTH = 255;

export interface AllUserPreferences {
  tasks: TaskPreferences;
  focus: FocusPreferences;
  habits: HabitPreferences;
  matrix: MatrixPreferences;
  growth: GrowthPreferences;
  learn: LearnPreferences;
  journal: JournalPreferences;
  money: MoneyPreferences;
  budget: BudgetPreferences;
  gym: GymPreferences;
  usage: UsagePreferences;
}

export const DEFAULT_TASK_PREFERENCES: TaskPreferences = {
  defaultDate: 'NONE',
  defaultPriority: 'NONE',
  defaultTaskListId: '',
};

export const DEFAULT_FOCUS_PREFERENCES: FocusPreferences = {
  workDurationMinutes: 30,
  shortBreakDurationMinutes: 5,
  longBreakDurationMinutes: 15,
  longBreakInterval: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  countOvertime: false,
  completionSound: 'bell',
  desktopNotification: true,
};

export const DEFAULT_HABIT_PREFERENCES: HabitPreferences = {
  dayRolloverCutoffHour: 4,
  weekStartDay: 'MONDAY',
};

export const DEFAULT_MATRIX_PREFERENCES: MatrixPreferences = {
  urgentDueWithinDays: 2,
  urgentPriorities: ['HIGH'],
  importantPriorities: ['HIGH'],
};

export const DEFAULT_GROWTH_PREFERENCES: GrowthPreferences = {
  celebrationIntensity: 'FULL',
  rewardConfirmationThreshold: 100,
  showRewardReceipts: true,
  showAnimations: true,
};

export const DEFAULT_LEARN_PREFERENCES: LearnPreferences = {
  reviewOrder: 'DUE_DATE',
  dailyReviewLimit: 50,
  dailyNewCardLimit: 20,
};

export const DEFAULT_JOURNAL_PREFERENCES: JournalPreferences = {
  defaultEditorMode: 'LIVE',
  autoCreateDailyNote: true,
  autoOpenTodayNote: true,
  weekStartDay: 'MONDAY',
  autoCreateWeeklyReview: true,
};

export const DEFAULT_MONEY_PREFERENCES: MoneyPreferences = {
  defaultCurrency: 'VND',
  defaultTransactionType: 'EXPENSE',
  rememberPaymentMethod: true,
  merchantSuggestionsEnabled: true,
  budgetWarningThreshold: 80,
  budgetAlertsEnabled: true,
};

export const DEFAULT_BUDGET_PREFERENCES: BudgetPreferences = DEFAULT_MONEY_PREFERENCES;

export const DEFAULT_GYM_PREFERENCES: GymPreferences = {
  weightUnit: 'KG',
  distanceUnit: 'KM',
  defaultRestSeconds: 120,
  autoStartRestTimer: true,
  previousPerformanceMode: 'EXERCISE',
  showRpe: false,
  weeklyWorkoutGoal: 3,
};

export const DEFAULT_USAGE_PREFERENCES: UsagePreferences = {
  trackingEnabled: false,
  websiteTrackingEnabled: false,
  retentionDays: 90,
  idleThresholdSeconds: 300,
  excludedBundleIds: [],
};

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string): Promise<AllUserPreferences> {
    const record = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    const tasks = { ...DEFAULT_TASK_PREFERENCES, ...((record?.taskPreferences as Partial<TaskPreferences>) || {}) };
    const focus = { ...DEFAULT_FOCUS_PREFERENCES, ...((record?.focusPreferences as Partial<FocusPreferences>) || {}) };
    const habits = { ...DEFAULT_HABIT_PREFERENCES, ...((record?.habitPreferences as Partial<HabitPreferences>) || {}) };
    const matrix = { ...DEFAULT_MATRIX_PREFERENCES, ...((record?.matrixPreferences as Partial<MatrixPreferences>) || {}) };
    const growth = { ...DEFAULT_GROWTH_PREFERENCES, ...((record?.growthPreferences as Partial<GrowthPreferences>) || {}) };
    const learn = { ...DEFAULT_LEARN_PREFERENCES, ...((record?.learnPreferences as Partial<LearnPreferences>) || {}) };
    const journal = { ...DEFAULT_JOURNAL_PREFERENCES, ...((record?.journalPreferences as Partial<JournalPreferences>) || {}) };
    const money = { ...DEFAULT_MONEY_PREFERENCES, ...((record?.moneyPreferences as Partial<MoneyPreferences>) || {}) };
    const budget = { ...DEFAULT_BUDGET_PREFERENCES, ...((record?.budgetPreferences as Partial<BudgetPreferences>) || (record?.moneyPreferences as Partial<MoneyPreferences>) || {}) };
    const gym = { ...DEFAULT_GYM_PREFERENCES, ...((record?.gymPreferences as Partial<GymPreferences>) || {}) };
    const usage = { ...DEFAULT_USAGE_PREFERENCES, ...((record?.usagePreferences as Partial<UsagePreferences>) || {}) };

    return { tasks, focus, habits, matrix, growth, learn, journal, money, budget, gym, usage };
  }

  async updateTaskPreferences(userId: string, patch: Partial<TaskPreferences>): Promise<TaskPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.tasks, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, taskPreferences: updated as any },
      update: { taskPreferences: updated as any },
    });
    return updated;
  }

  async updateFocusPreferences(userId: string, patch: Partial<FocusPreferences>): Promise<FocusPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.focus, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, focusPreferences: updated as any },
      update: { focusPreferences: updated as any },
    });
    return updated;
  }

  async updateHabitPreferences(userId: string, patch: Partial<HabitPreferences>): Promise<HabitPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.habits, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, habitPreferences: updated as any },
      update: { habitPreferences: updated as any },
    });
    return updated;
  }

  async updateMatrixPreferences(userId: string, patch: Partial<MatrixPreferences>): Promise<MatrixPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.matrix, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, matrixPreferences: updated as any },
      update: { matrixPreferences: updated as any },
    });
    return updated;
  }

  async updateGrowthPreferences(userId: string, patch: Partial<GrowthPreferences>): Promise<GrowthPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.growth, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, growthPreferences: updated as any },
      update: { growthPreferences: updated as any },
    });
    return updated;
  }

  async updateLearnPreferences(userId: string, patch: Partial<LearnPreferences>): Promise<LearnPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.learn, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, learnPreferences: updated as any },
      update: { learnPreferences: updated as any },
    });
    return updated;
  }

  async updateJournalPreferences(userId: string, patch: Partial<JournalPreferences>): Promise<JournalPreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.journal, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, journalPreferences: updated as any },
      update: { journalPreferences: updated as any },
    });
    return updated;
  }

  async updateMoneyPreferences(userId: string, patch: Partial<MoneyPreferences>): Promise<MoneyPreferences> {
    const current = await this.getPreferences(userId);
    const updatedMoney = { ...current.money, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, moneyPreferences: updatedMoney as any, budgetPreferences: updatedMoney as any },
      update: { moneyPreferences: updatedMoney as any, budgetPreferences: updatedMoney as any },
    });
    return updatedMoney;
  }

  async updateBudgetPreferences(userId: string, patch: Partial<BudgetPreferences>): Promise<BudgetPreferences> {
    const current = await this.getPreferences(userId);
    const updatedBudget = { ...current.budget, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, budgetPreferences: updatedBudget as any, moneyPreferences: updatedBudget as any },
      update: { budgetPreferences: updatedBudget as any, moneyPreferences: updatedBudget as any },
    });
    return updatedBudget;
  }

  async updateGymPreferences(userId: string, patch: Partial<GymPreferences>): Promise<GymPreferences> {
    const current = await this.getPreferences(userId);
    const updatedGym = { ...current.gym, ...patch };
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, gymPreferences: updatedGym as any },
      update: { gymPreferences: updatedGym as any },
    });
    return updatedGym;
  }

  async updateUsagePreferences(userId: string, patch: Partial<UsagePreferences>): Promise<UsagePreferences> {
    const current = await this.getPreferences(userId);
    const updated = { ...current.usage, ...patch };
    if (typeof updated.trackingEnabled !== 'boolean') throw new BadRequestException('trackingEnabled must be a boolean');
    if (typeof updated.websiteTrackingEnabled !== 'boolean') throw new BadRequestException('websiteTrackingEnabled must be a boolean');
    if (!Number.isInteger(updated.retentionDays) || updated.retentionDays < 7 || updated.retentionDays > 365) {
      throw new BadRequestException('retentionDays must be an integer between 7 and 365');
    }
    if (
      !Number.isInteger(updated.idleThresholdSeconds) ||
      updated.idleThresholdSeconds < 60 ||
      updated.idleThresholdSeconds > 1800
    ) {
      throw new BadRequestException('idleThresholdSeconds must be an integer between 60 and 1800');
    }
    if (
      !Array.isArray(updated.excludedBundleIds) ||
      updated.excludedBundleIds.length > MAX_EXCLUDED_BUNDLE_IDS ||
      updated.excludedBundleIds.some((id) => typeof id !== 'string')
    ) {
      throw new BadRequestException(`excludedBundleIds must be an array of at most ${MAX_EXCLUDED_BUNDLE_IDS} strings`);
    }
    if (
      updated.excludedBundleIds.some((id) => {
        const normalized = id.trim();
        return normalized.length === 0 || normalized.length > MAX_EXCLUDED_BUNDLE_ID_LENGTH;
      })
    ) {
      throw new BadRequestException(
        `excludedBundleIds entries must be between 1 and ${MAX_EXCLUDED_BUNDLE_ID_LENGTH} characters`,
      );
    }
    updated.excludedBundleIds = Array.from(new Set(updated.excludedBundleIds.map((id) => id.trim())));
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, usagePreferences: updated as any },
      update: { usagePreferences: updated as any },
    });
    return updated;
  }
}
