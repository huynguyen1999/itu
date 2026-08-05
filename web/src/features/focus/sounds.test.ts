import { describe, expect, it, beforeEach } from 'vitest';
import { DEFAULT_FOCUS_AUDIO_SETTINGS, getStoredFocusAudioSettings, saveFocusAudioSettings } from './sounds';

describe('focus sound catalog', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        clear: () => values.clear(),
      },
    });
  });

  it('falls back to safe defaults when stored settings are malformed', () => {
    localStorage.setItem('itu.focus.audio-settings', '{bad');
    expect(getStoredFocusAudioSettings()).toEqual(DEFAULT_FOCUS_AUDIO_SETTINGS);
  });

  it('clamps persisted volume and round-trips settings', () => {
    saveFocusAudioSettings({ ...DEFAULT_FOCUS_AUDIO_SETTINGS, enabled: true, volume: 2, muted: true });
    expect(getStoredFocusAudioSettings()).toMatchObject({ enabled: true, volume: 1, muted: true });
  });
});
