import {
  getPreferences as getPreferencesApi,
  updateGymPreferences as updateGymPreferencesApi,
  updateMoneyPreferences as updateMoneyPreferencesApi,
  updateTaskPreferences as updateTaskPreferencesApi,
  updateFocusPreferences as updateFocusPreferencesApi,
  updateHabitPreferences as updateHabitPreferencesApi,
  updateMatrixPreferences as updateMatrixPreferencesApi,
  updateGrowthPreferences as updateGrowthPreferencesApi,
  updateLearnPreferences as updateLearnPreferencesApi,
  updateJournalPreferences as updateJournalPreferencesApi,
} from '../../generated/api/preferences/preferences';
import type { ApiClientContext } from './apiContext';

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

export interface UserPreferencesResponse {
  tasks: TaskPreferences;
  focus: FocusPreferences;
  habits: HabitPreferences;
  matrix: MatrixPreferences;
  growth: GrowthPreferences;
  learn: LearnPreferences;
  journal: JournalPreferences;
  money: MoneyPreferences;
  gym: GymPreferences;
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

export const DEFAULT_GYM_PREFERENCES: GymPreferences = {
  weightUnit: 'KG',
  distanceUnit: 'KM',
  defaultRestSeconds: 120,
  autoStartRestTimer: true,
  previousPerformanceMode: 'EXERCISE',
  showRpe: true,
  weeklyWorkoutGoal: 3,
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
        gym: DEFAULT_GYM_PREFERENCES,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      tasks: { ...DEFAULT_TASK_PREFERENCES, ...(parsed.tasks || {}) },
      focus: { ...DEFAULT_FOCUS_PREFERENCES, ...(parsed.focus || {}) },
      habits: { ...DEFAULT_HABIT_PREFERENCES, ...(parsed.habits || {}) },
      matrix: { ...DEFAULT_MATRIX_PREFERENCES, ...(parsed.matrix || {}) },
      growth: { ...DEFAULT_GROWTH_PREFERENCES, ...(parsed.growth || {}) },
      learn: { ...DEFAULT_LEARN_PREFERENCES, ...(parsed.learn || {}) },
      journal: { ...DEFAULT_JOURNAL_PREFERENCES, ...(parsed.journal || {}) },
      money: { ...DEFAULT_MONEY_PREFERENCES, ...(parsed.money || {}) },
      gym: { ...DEFAULT_GYM_PREFERENCES, ...(parsed.gym || {}) },
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
      gym: DEFAULT_GYM_PREFERENCES,
    };
  }
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
  updateGymPreferences(patch: Partial<GymPreferences>): Promise<GymPreferences>;
}

export function createPreferencesApi(context: ApiClientContext): PreferencesApi {
  return {
    async getPreferences() {
      try {
        const res = (await getPreferencesApi()) as unknown as UserPreferencesResponse;
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
        return (await updateTaskPreferencesApi(patch as any)) as unknown as TaskPreferences;
      } catch {
        return updated;
      }
    },
    async updateFocusPreferences(patch: Partial<FocusPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.focus, ...patch };
      saveLocalPreferences({ ...local, focus: updated });
      try {
        return (await updateFocusPreferencesApi(patch as any)) as unknown as FocusPreferences;
      } catch {
        return updated;
      }
    },
    async updateHabitPreferences(patch: Partial<HabitPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.habits, ...patch };
      saveLocalPreferences({ ...local, habits: updated });
      try {
        return (await updateHabitPreferencesApi(patch as any)) as unknown as HabitPreferences;
      } catch {
        return updated;
      }
    },
    async updateMatrixPreferences(patch: Partial<MatrixPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.matrix, ...patch };
      saveLocalPreferences({ ...local, matrix: updated });
      try {
        return (await updateMatrixPreferencesApi(patch as any)) as unknown as MatrixPreferences;
      } catch {
        return updated;
      }
    },
    async updateGrowthPreferences(patch: Partial<GrowthPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.growth, ...patch };
      saveLocalPreferences({ ...local, growth: updated });
      try {
        return (await updateGrowthPreferencesApi(patch as any)) as unknown as GrowthPreferences;
      } catch {
        return updated;
      }
    },
    async updateLearnPreferences(patch: Partial<LearnPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.learn, ...patch };
      saveLocalPreferences({ ...local, learn: updated });
      try {
        return (await updateLearnPreferencesApi(patch as any)) as unknown as LearnPreferences;
      } catch {
        return updated;
      }
    },
    async updateJournalPreferences(patch: Partial<JournalPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.journal, ...patch };
      saveLocalPreferences({ ...local, journal: updated });
      try {
        return (await updateJournalPreferencesApi(patch as any)) as unknown as JournalPreferences;
      } catch {
        return updated;
      }
    },
    async updateMoneyPreferences(patch: Partial<MoneyPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.money, ...patch };
      saveLocalPreferences({ ...local, money: updated });
      try {
        return (await updateMoneyPreferencesApi(patch as any)) as unknown as MoneyPreferences;
      } catch {
        return updated;
      }
    },
    async updateGymPreferences(patch: Partial<GymPreferences>) {
      const local = getLocalPreferences();
      const updated = { ...local.gym, ...patch };
      saveLocalPreferences({ ...local, gym: updated });
      try {
        return (await updateGymPreferencesApi(patch as any)) as unknown as GymPreferences;
      } catch {
        return updated;
      }
    },
  };
}
