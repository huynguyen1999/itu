import {
  getPreferences as getPreferencesApi,
  updateGymPreferences as updateGymPreferencesApi,
  updateMoneyPreferences as updateMoneyPreferencesApi,
} from '../../generated/api/preferences/preferences';
import type { ApiClientContext } from './apiContext';

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
  money: MoneyPreferences;
  gym: GymPreferences;
}

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

const STORAGE_KEY = 'itu_user_preferences_v1';

function getLocalPreferences(): UserPreferencesResponse {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { money: DEFAULT_MONEY_PREFERENCES, gym: DEFAULT_GYM_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      money: { ...DEFAULT_MONEY_PREFERENCES, ...(parsed.money || {}) },
      gym: { ...DEFAULT_GYM_PREFERENCES, ...(parsed.gym || {}) },
    };
  } catch {
    return { money: DEFAULT_MONEY_PREFERENCES, gym: DEFAULT_GYM_PREFERENCES };
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
