export interface PreferenceRecord {
  taskPreferences: unknown;
  focusPreferences: unknown;
  habitPreferences: unknown;
  matrixPreferences: unknown;
  growthPreferences: unknown;
  learnPreferences: unknown;
  journalPreferences: unknown;
  moneyPreferences: unknown;
  budgetPreferences: unknown;
  gymPreferences: unknown;
  usagePreferences: unknown;
  calendarPreferences: unknown;
}

export type PreferenceUpdate = Partial<PreferenceRecord>;

export interface IPreferencesRepository {
  findByUserId(userId: string): Promise<PreferenceRecord | null>;
  upsert(userId: string, update: PreferenceUpdate): Promise<void>;
}

export const PREFERENCES_REPOSITORY = 'PREFERENCES_REPOSITORY';
