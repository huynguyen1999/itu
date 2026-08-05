export interface FocusUserSettings {
  autoContinueOvertime: boolean;
  soundEnabled: boolean;
  notificationEnabled: boolean;
  defaultWorkMinutes: number;
}

const SETTINGS_KEY = 'itu.focus.user-settings';

export const DEFAULT_FOCUS_SETTINGS: FocusUserSettings = {
  autoContinueOvertime: true,
  soundEnabled: true,
  notificationEnabled: true,
  defaultWorkMinutes: 30,
};

export function getStoredFocusSettings(): FocusUserSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_FOCUS_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<FocusUserSettings>;
    return {
      ...DEFAULT_FOCUS_SETTINGS,
      ...parsed,
      defaultWorkMinutes: Math.max(
        1,
        Math.min(180, Number(parsed.defaultWorkMinutes) || DEFAULT_FOCUS_SETTINGS.defaultWorkMinutes),
      ),
    };
  } catch {
    return DEFAULT_FOCUS_SETTINGS;
  }
}

export function saveStoredFocusSettings(settings: FocusUserSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
