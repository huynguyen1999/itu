export interface FocusUserSettings {
  defaultWorkMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  countExceededFocusTime: boolean;
  autoContinueOvertime?: boolean;
  soundEnabled: boolean;
  notificationEnabled: boolean;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
}

const SETTINGS_KEY = 'itu.focus.user-settings';

export const DEFAULT_FOCUS_SETTINGS: FocusUserSettings = {
  defaultWorkMinutes: 30,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  countExceededFocusTime: true,
  autoContinueOvertime: true,
  soundEnabled: true,
  notificationEnabled: true,
  autoStartBreaks: false,
  autoStartWork: false,
};

export function getStoredFocusSettings(): FocusUserSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_FOCUS_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<FocusUserSettings>;
    const countExceeded = parsed.countExceededFocusTime ?? (parsed.autoContinueOvertime ?? true);
    return {
      ...DEFAULT_FOCUS_SETTINGS,
      ...parsed,
      countExceededFocusTime: countExceeded,
      autoContinueOvertime: countExceeded,
      defaultWorkMinutes: Math.max(1, Math.min(240, Number(parsed.defaultWorkMinutes) || 30)),
      shortBreakMinutes: Math.max(1, Math.min(60, Number(parsed.shortBreakMinutes) || 5)),
      longBreakMinutes: Math.max(1, Math.min(120, Number(parsed.longBreakMinutes) || 15)),
      cyclesBeforeLongBreak: Math.max(1, Math.min(20, Number(parsed.cyclesBeforeLongBreak) || 4)),
      autoStartBreaks: false,
      autoStartWork: false,
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
