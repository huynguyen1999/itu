export const FOCUS_AUDIO_SETTINGS_KEY = 'itu.focus.audio-settings';
export const FOCUS_SOUND_CATALOG_KEY = 'itu.focus.sound-catalog';

export const OFFLINE_FOCUS_SOUNDS = [
  {
    id: 'builtin:rain',
    name: 'Rain',
    originalName: 'Rain',
    url: '/audio/focus/rain.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 0,
    version: 1,
    category: 'Nature',
    source: 'BUILTIN' as const,
    defaultVolume: 0.42,
  },
  {
    id: 'builtin:forest',
    name: 'Forest',
    originalName: 'Forest',
    url: '/audio/focus/forest.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 0,
    version: 1,
    category: 'Nature',
    source: 'BUILTIN' as const,
    defaultVolume: 0.42,
  },
  {
    id: 'builtin:cafe',
    name: 'Café',
    originalName: 'Café',
    url: '/audio/focus/cafe.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 0,
    version: 1,
    category: 'Atmosphere',
    source: 'BUILTIN' as const,
    defaultVolume: 0.32,
  },
  {
    id: 'builtin:brown-noise',
    name: 'Brown noise',
    originalName: 'Brown noise',
    url: '/audio/focus/brown-noise.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 0,
    version: 1,
    category: 'Noise',
    source: 'BUILTIN' as const,
    defaultVolume: 0.35,
  },
] as const;

export interface FocusAudioSettings {
  enabled: boolean;
  selectedSoundKey: string;
  volume: number;
  muted: boolean;
}

export const DEFAULT_FOCUS_AUDIO_SETTINGS: FocusAudioSettings = {
  enabled: true,
  selectedSoundKey: 'builtin:rain',
  volume: 0.42,
  muted: false,
};

export function getStoredFocusAudioSettings(): FocusAudioSettings {
  try {
    const value = JSON.parse(localStorage.getItem(FOCUS_AUDIO_SETTINGS_KEY) ?? '{}') as Partial<FocusAudioSettings>;
    return {
      ...DEFAULT_FOCUS_AUDIO_SETTINGS,
      ...value,
      volume: Math.max(0, Math.min(1, Number(value.volume ?? DEFAULT_FOCUS_AUDIO_SETTINGS.volume))),
    };
  } catch {
    return DEFAULT_FOCUS_AUDIO_SETTINGS;
  }
}

export function getStoredFocusSoundCatalog<T>() {
  try {
    const value = JSON.parse(localStorage.getItem(FOCUS_SOUND_CATALOG_KEY) ?? '[]') as T;
    return Array.isArray(value) ? value : [];
  } catch {
    return [] as T;
  }
}

export function saveFocusSoundCatalog<T>(catalog: T) {
  try {
    localStorage.setItem(FOCUS_SOUND_CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // Storage is optional.
  }
}

export function saveFocusAudioSettings(settings: FocusAudioSettings) {
  try {
    localStorage.setItem(FOCUS_AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage is optional.
  }
}
