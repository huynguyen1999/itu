import type { ApiClientContext } from './apiContext';
import { SYNC_KINDS } from '../sync/syncKinds';
import type { CalendarTimelineItem } from './types';

export interface TaskPreferences {
  defaultDate: 'NONE' | 'TODAY' | 'TOMORROW';
  defaultDueTime: string;
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

export type BudgetPreferences = MoneyPreferences;

export interface GymPreferences {
  weightUnit: 'KG' | 'LBS';
  distanceUnit: 'KM' | 'MI';
  defaultRestSeconds: number;
  autoStartRestTimer: boolean;
  previousPerformanceMode: 'EXERCISE' | 'ROUTINE';
  showRpe: boolean;
  showPrevious: boolean;
  soundsEnabled: boolean;
  restSoundEnabled: boolean;
  completionSoundEnabled: boolean;
  favoriteExerciseIds: string[];
  weeklyWorkoutGoal?: number;
}

export interface UsagePreferences {
  trackingEnabled: boolean;
  websiteTrackingEnabled: boolean;
  retentionDays: number;
  idleThresholdSeconds: number;
  excludedBundleIds: string[];
}

export interface CalendarPreferences {
  zoom: 'DAY' | 'WEEK' | 'MONTH';
  visibleKinds: CalendarTimelineItem['kind'][];
  showCompleted: boolean;
  collapsedGroupIds: string[];
}

export interface UserPreferencesResponse {
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
  calendar: CalendarPreferences;
}

export const DEFAULT_TASK_PREFERENCES: TaskPreferences = {
  defaultDate: 'NONE',
  defaultDueTime: '21:00',
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

export const DEFAULT_GYM_PREFERENCES: GymPreferences = {
  weightUnit: 'KG',
  distanceUnit: 'KM',
  defaultRestSeconds: 120,
  autoStartRestTimer: true,
  previousPerformanceMode: 'EXERCISE',
  showRpe: false,
  showPrevious: true,
  soundsEnabled: true,
  restSoundEnabled: true,
  completionSoundEnabled: true,
  favoriteExerciseIds: [],
  weeklyWorkoutGoal: 3,
};

export const DEFAULT_USAGE_PREFERENCES: UsagePreferences = {
  trackingEnabled: false,
  websiteTrackingEnabled: false,
  retentionDays: 90,
  idleThresholdSeconds: 300,
  excludedBundleIds: [],
};

export const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = {
  zoom: 'WEEK',
  visibleKinds: ['TASK_DURATION', 'TASK_DUE', 'FOCUS_SESSION', 'EXTERNAL_EVENT'],
  showCompleted: true,
  collapsedGroupIds: [],
};

const STORAGE_KEY = 'itu_user_preferences_v2';

function getLocalPreferences(): UserPreferencesResponse {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        tasks: DEFAULT_TASK_PREFERENCES,
        focus: DEFAULT_FOCUS_PREFERENCES,
        habits: DEFAULT_HABIT_PREFERENCES,
        matrix: DEFAULT_MATRIX_PREFERENCES,
        growth: DEFAULT_GROWTH_PREFERENCES,
        learn: DEFAULT_LEARN_PREFERENCES,
        journal: DEFAULT_JOURNAL_PREFERENCES,
        money: DEFAULT_MONEY_PREFERENCES,
        budget: DEFAULT_MONEY_PREFERENCES,
        gym: DEFAULT_GYM_PREFERENCES,
        usage: DEFAULT_USAGE_PREFERENCES,
        calendar: DEFAULT_CALENDAR_PREFERENCES,
      };
    }
    const parsed = JSON.parse(raw);
    const moneyPref = { ...DEFAULT_MONEY_PREFERENCES, ...(parsed.money || parsed.budget || {}) };
    return {
      tasks: { ...DEFAULT_TASK_PREFERENCES, ...(parsed.tasks || {}) },
      focus: { ...DEFAULT_FOCUS_PREFERENCES, ...(parsed.focus || {}) },
      habits: { ...DEFAULT_HABIT_PREFERENCES, ...(parsed.habits || {}) },
      matrix: { ...DEFAULT_MATRIX_PREFERENCES, ...(parsed.matrix || {}) },
      growth: { ...DEFAULT_GROWTH_PREFERENCES, ...(parsed.growth || {}) },
      learn: { ...DEFAULT_LEARN_PREFERENCES, ...(parsed.learn || {}) },
      journal: { ...DEFAULT_JOURNAL_PREFERENCES, ...(parsed.journal || {}) },
      money: moneyPref,
      budget: moneyPref,
      gym: { ...DEFAULT_GYM_PREFERENCES, ...(parsed.gym || {}) },
      usage: { ...DEFAULT_USAGE_PREFERENCES, ...(parsed.usage || {}) },
      calendar: { ...DEFAULT_CALENDAR_PREFERENCES, ...(parsed.calendar || {}) },
    };
  } catch {
    return {
      tasks: DEFAULT_TASK_PREFERENCES,
      focus: DEFAULT_FOCUS_PREFERENCES,
      habits: DEFAULT_HABIT_PREFERENCES,
      matrix: DEFAULT_MATRIX_PREFERENCES,
      growth: DEFAULT_GROWTH_PREFERENCES,
      learn: DEFAULT_LEARN_PREFERENCES,
      journal: DEFAULT_JOURNAL_PREFERENCES,
      money: DEFAULT_MONEY_PREFERENCES,
      budget: DEFAULT_MONEY_PREFERENCES,
      gym: DEFAULT_GYM_PREFERENCES,
      usage: DEFAULT_USAGE_PREFERENCES,
      calendar: DEFAULT_CALENDAR_PREFERENCES,
    };
  }
}

export function getStoredTaskPreferences(): TaskPreferences {
  return getLocalPreferences().tasks;
}

function saveLocalPreferences(prefs: UserPreferencesResponse) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export interface PreferencesApi {
  getPreferences(): Promise<UserPreferencesResponse>;
  updateTaskPreferences(patch: Partial<TaskPreferences>): Promise<TaskPreferences>;
  updateFocusPreferences(patch: Partial<FocusPreferences>): Promise<FocusPreferences>;
  updateHabitPreferences(patch: Partial<HabitPreferences>): Promise<HabitPreferences>;
  updateMatrixPreferences(patch: Partial<MatrixPreferences>): Promise<MatrixPreferences>;
  updateGrowthPreferences(patch: Partial<GrowthPreferences>): Promise<GrowthPreferences>;
  updateLearnPreferences(patch: Partial<LearnPreferences>): Promise<LearnPreferences>;
  updateJournalPreferences(patch: Partial<JournalPreferences>): Promise<JournalPreferences>;
  updateMoneyPreferences(patch: Partial<MoneyPreferences>): Promise<MoneyPreferences>;
  updateBudgetPreferences(patch: Partial<BudgetPreferences>): Promise<BudgetPreferences>;
  updateGymPreferences(patch: Partial<GymPreferences>): Promise<GymPreferences>;
  updateUsagePreferences(patch: Partial<UsagePreferences>): Promise<UsagePreferences>;
  updateCalendarPreferences(patch: Partial<CalendarPreferences>): Promise<CalendarPreferences>;
}

export function createPreferencesApi(context: ApiClientContext): PreferencesApi {
  return {
    async getPreferences() {
      try {
        const res = await context.request<UserPreferencesResponse>('/preferences');
        saveLocalPreferences(res);
        return res;
      } catch {
        return getLocalPreferences();
      }
    },
    async updateTaskPreferences(patch: Partial<TaskPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.tasks, ...patch };
      saveLocalPreferences({ ...local, tasks: updated });
      try {
        return await context.request<TaskPreferences>('/preferences/tasks', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateFocusPreferences(patch: Partial<FocusPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.focus, ...patch };
      saveLocalPreferences({ ...local, focus: updated });
      try {
        return await context.request<FocusPreferences>('/preferences/focus', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateHabitPreferences(patch: Partial<HabitPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.habits, ...patch };
      saveLocalPreferences({ ...local, habits: updated });
      try {
        return await context.request<HabitPreferences>('/preferences/habits', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateMatrixPreferences(patch: Partial<MatrixPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.matrix, ...patch };
      saveLocalPreferences({ ...local, matrix: updated });
      try {
        return await context.request<MatrixPreferences>('/preferences/matrix', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateGrowthPreferences(patch: Partial<GrowthPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.growth, ...patch };
      saveLocalPreferences({ ...local, growth: updated });
      try {
        return await context.request<GrowthPreferences>('/preferences/growth', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateLearnPreferences(patch: Partial<LearnPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.learn, ...patch };
      saveLocalPreferences({ ...local, learn: updated });
      try {
        return await context.request<LearnPreferences>('/preferences/learn', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateJournalPreferences(patch: Partial<JournalPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.journal, ...patch };
      saveLocalPreferences({ ...local, journal: updated });
      try {
        return await context.request<JournalPreferences>('/preferences/journal', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateMoneyPreferences(patch: Partial<MoneyPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.money, ...patch };
      saveLocalPreferences({ ...local, money: updated, budget: updated });
      try {
        return await context.request<MoneyPreferences>('/preferences/money', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateBudgetPreferences(patch: Partial<BudgetPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...(local.budget || local.money), ...patch };
      saveLocalPreferences({ ...local, budget: updated, money: updated });
      return context.offlineMutation(
        {
          kind: SYNC_KINDS.budgetPreferences.update,
          entityId: 'budget',
          payload: patch,
          optimistic: { id: 'budget', ...updated } as unknown as BudgetPreferences,
        },
        async () => {
          try {
            return (await context.request('/preferences/budget', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            })) as unknown as BudgetPreferences;
          } catch {
            return updated;
          }
        },
      );
    },
    async updateGymPreferences(patch: Partial<GymPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.gym, ...patch };
      saveLocalPreferences({ ...local, gym: updated });
      return context.offlineMutation(
        {
          kind: SYNC_KINDS.gymPreferences.update,
          entityId: 'gym',
          payload: patch,
          optimistic: { id: 'gym', ...updated } as unknown as GymPreferences,
        },
        async () => {
          try {
            return await context.request<GymPreferences>('/preferences/gym', {
              method: 'PATCH',
              body: JSON.stringify(patch),
            });
          } catch {
            return updated;
          }
        },
      );
    },
    async updateUsagePreferences(patch: Partial<UsagePreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.usage, ...patch };
      saveLocalPreferences({ ...local, usage: updated });
      try {
        return await context.request<UsagePreferences>('/preferences/usage', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      } catch {
        return updated;
      }
    },
    async updateCalendarPreferences(patch: Partial<CalendarPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.calendar, ...patch };
      saveLocalPreferences({ ...local, calendar: updated });
      return context.offlineMutation(
        {
          kind: SYNC_KINDS.calendarPreferences.update,
          entityId: 'calendar',
          payload: patch,
          optimistic: { id: 'calendar', ...updated } as unknown as CalendarPreferences,
        },
        async () => {
          try {
            return await context.request<CalendarPreferences>('/preferences/calendar', {
              method: 'PATCH',
              body: JSON.stringify(patch),
            });
          } catch {
            return updated;
          }
        },
      );
    },
  };
}
