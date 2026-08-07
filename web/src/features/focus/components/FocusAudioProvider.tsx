import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE_URL } from '@/shared/api/client';
import type { FocusSession, FocusSound } from '@/shared/api/types';
import {
  getStoredFocusAudioSettings,
  getStoredFocusSoundCatalog,
  DEFAULT_FOCUS_AUDIO_SETTINGS,
  OFFLINE_FOCUS_SOUNDS,
  saveFocusAudioSettings,
  saveFocusSoundCatalog,
  type FocusAudioSettings,
} from '../sounds';

const AUDIO_CACHE_NAME = 'itu-focus-sounds-v1';
const BUILTIN_SOUND_DOWNLOAD_STATUS = {
  downloading: 'downloading',
  downloaded: 'downloaded',
  failed: 'failed',
} as const;

type BuiltinSoundDownloadStatus = (typeof BUILTIN_SOUND_DOWNLOAD_STATUS)[keyof typeof BUILTIN_SOUND_DOWNLOAD_STATUS];

interface FocusAudioContextValue {
  sounds: FocusSound[];
  settings: FocusAudioSettings;
  selectedSound: FocusSound | null;
  isPlaying: boolean;
  playbackPosition: number;
  playbackDuration: number;
  error: string | null;
  cachedSoundKeys: Set<string>;
  downloadStatuses: Record<string, BuiltinSoundDownloadStatus>;
  setEnabled: (enabled: boolean) => void;
  setSelectedSound: (soundKey: string) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  startFromGesture: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  seek: (seconds: number) => void;
  preview: (soundKey: string) => Promise<void>;
  downloadSound: (soundKey: string) => Promise<void>;
  renameCustomSound: (soundKey: string, name: string) => Promise<void>;
  removeCustomSound: (soundKey: string) => Promise<void>;
}

const FocusAudioContext = createContext<FocusAudioContextValue | null>(null);

export function FocusAudioProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const soundsQuery = useQuery({
    queryKey: ['focus', 'sounds'],
    queryFn: async () => {
      try {
        const result = await api.focusSounds();
        saveFocusSoundCatalog(result.sounds);
        return result;
      } catch (error) {
        const sounds = getStoredFocusSoundCatalog<FocusSound[]>();
        if (sounds.length === 0) return { sounds: OFFLINE_FOCUS_SOUNDS as unknown as FocusSound[], preferences: [] };
        return { sounds, preferences: [] };
      }
    },
  });
  const activeQuery = useQuery<FocusSession | null>({
    queryKey: ['focus', 'active'],
    queryFn: () => api.activeFocus(),
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [settings, setSettings] = useState<FocusAudioSettings>(getStoredFocusAudioSettings);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadStatuses, setDownloadStatuses] = useState<Record<string, BuiltinSoundDownloadStatus>>({});
  const playingOnHide = useRef(false);

  const sounds = useMemo(() => {
    if (soundsQuery.data?.sounds) return soundsQuery.data.sounds;
    const stored = getStoredFocusSoundCatalog<FocusSound[]>();
    return stored.length > 0 ? stored : (OFFLINE_FOCUS_SOUNDS as unknown as FocusSound[]);
  }, [soundsQuery.data]);

  const selectedSound = sounds.find((sound) => sound.id === settings.selectedSoundKey) ?? sounds[0] ?? null;

  const persist = useCallback((next: FocusAudioSettings) => {
    setSettings(next);
    saveFocusAudioSettings(next);
  }, []);

  const [cachedSoundKeys, setCachedSoundKeys] = useState<Set<string>>(() => new Set());
  const cachedKeysRef = useRef<Set<string>>(new Set());
  const downloadControllersRef = useRef<Record<string, AbortController>>({});

  // On mount, discover what's already cached
  useEffect(() => {
    void (async () => {
      try {
        const cache = await caches.open(AUDIO_CACHE_NAME);
        const keys = await cache.keys();
        const keySet = new Set(keys.map((r) => new URL(r.url).pathname));
        cachedKeysRef.current = keySet;
        setCachedSoundKeys(new Set(keySet));
      } catch {
        // Cache API unavailable — proceed without caching
      }
    })();
  }, []);

  /** Build the backend static URL for a builtin sound. */
  const builtinSoundUrl = useCallback((sound: FocusSound): string => {
    return `${API_BASE_URL}${sound.url}`;
  }, []);

  const markSoundCached = useCallback((url: string) => {
    const pathname = new URL(url, window.location.href).pathname;
    cachedKeysRef.current.add(pathname);
    setCachedSoundKeys(new Set(cachedKeysRef.current));
  }, []);

  /** Resolve the final playable source for a sound (cached blob URL or remote). */
  const getSource = useCallback(
    async (sound: FocusSound): Promise<string> => {
      if (sound.source !== 'BUILTIN') {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = await api.objectUrl(sound.url);
        return objectUrlRef.current;
      }

      const remoteUrl = builtinSoundUrl(sound);

      // Try Cache API first
      try {
        const cache = await caches.open(AUDIO_CACHE_NAME);
        const cached = await cache.match(remoteUrl);
        if (cached) {
          const blob = await cached.blob();
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = URL.createObjectURL(blob);
          return objectUrlRef.current;
        }
      } catch {
        // Cache miss or unavailable — fall through to network
      }

      // Fetch from backend and cache
      const response = await fetch(remoteUrl);
      if (!response.ok) throw new Error(`Failed to load audio: ${response.status}`);
      const cloned = response.clone();
      try {
        const cache = await caches.open(AUDIO_CACHE_NAME);
        await cache.put(remoteUrl, cloned);
        markSoundCached(remoteUrl);
      } catch {
        // Caching failed — still play from network response
      }
      const blob = await response.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(blob);
      return objectUrlRef.current;
    },
    [builtinSoundUrl, markSoundCached],
  );

  const playSound = useCallback(
    async (sound: FocusSound) => {
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.loop = true;
      audio.volume = settings.muted ? 0 : settings.volume;
      const source = await getSource(sound);
      if (audio.src !== new URL(source, window.location.href).href) {
        audio.src = source;
        setPlaybackPosition(0);
        setPlaybackDuration(0);
      }
      setError(null);
      await audio.play();
      setIsPlaying(true);
    },
    [getSource, settings.muted, settings.volume],
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setPlaybackPosition(0);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(async () => {
    if (!settings.enabled || !selectedSound) return;
    try {
      await playSound(selectedSound);
    } catch {
      setError('Audio couldn’t start. Try the play button again.');
    }
  }, [playSound, selectedSound, settings.enabled]);

  const startFromGesture = useCallback(async () => {
    if (!settings.enabled || !selectedSound) return;
    try {
      await playSound(selectedSound);
    } catch {
      setError('Audio couldn’t start. Try the play button again.');
    }
  }, [playSound, selectedSound, settings.enabled]);

  const setSelectedSound = useCallback(
    (soundKey: string) => {
      const next = { ...settings, selectedSoundKey: soundKey };
      persist(next);
      void api.updateFocusSoundPreference(soundKey, { enabled: true, volume: Math.round(next.volume * 100) });
    },
    [persist, settings],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const next = { ...settings, enabled };
      persist(next);
      if (!enabled) stop();
    },
    [persist, settings, stop],
  );

  const setVolume = useCallback(
    (volume: number) => {
      const next = { ...settings, volume: Math.max(0, Math.min(1, volume)) };
      persist(next);
      if (audioRef.current) audioRef.current.volume = next.muted ? 0 : next.volume;
    },
    [persist, settings],
  );

  const setMuted = useCallback(
    (muted: boolean) => {
      const next = { ...settings, muted };
      persist(next);
      if (audioRef.current) audioRef.current.volume = muted ? 0 : next.volume;
    },
    [persist, settings],
  );

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : playbackDuration;
      if (!duration) return;
      const nextPosition = Math.max(0, Math.min(duration, seconds));
      audio.currentTime = nextPosition;
      setPlaybackPosition(nextPosition);
    },
    [playbackDuration],
  );

  const preview = useCallback(
    async (soundKey: string) => {
      const sound = sounds.find((item) => item.id === soundKey);
      if (!sound) return;
      const next = { ...settings, selectedSoundKey: soundKey };
      persist(next);
      try {
        await playSound(sound);
      } catch {
        setError('Audio couldn’t start. Try the play button again.');
      }
    },
    [persist, playSound, settings, sounds],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updatePosition = () => setPlaybackPosition(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    const updateDuration = () => {
      setPlaybackDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      updatePosition();
    };

    audio.addEventListener('timeupdate', updatePosition);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('seeked', updatePosition);
    updateDuration();

    return () => {
      audio.removeEventListener('timeupdate', updatePosition);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('seeked', updatePosition);
    };
  }, [isPlaying, selectedSound?.id]);

  useEffect(() => {
    if (!activeQuery.isFetched) return;
    const active = activeQuery.data;
    if (!active) {
      stop();
      return;
    }
    if (active.status === 'PAUSED') pause();
    if (active.status === 'COMPLETED' || active.status === 'ABANDONED') stop();
  }, [activeQuery.data, activeQuery.isFetched, pause, stop]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        playingOnHide.current = Boolean(audioRef.current && !audioRef.current.paused);
        return;
      }
      if (playingOnHide.current && activeQuery.data?.status === 'ACTIVE') void resume();
      playingOnHide.current = false;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [activeQuery.data?.status, resume]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      Object.values(downloadControllersRef.current).forEach((controller) => controller.abort());
    };
  }, []);

  /** Download (and cache) a builtin sound for offline use. */
  const downloadSound = useCallback(
    async (soundKey: string) => {
      const sound = sounds.find((s) => s.id === soundKey);
      if (!sound || sound.source !== 'BUILTIN') return;
      if (cachedKeysRef.current.has(sound.url)) {
        setDownloadStatuses((current) => ({
          ...current,
          [sound.id]: BUILTIN_SOUND_DOWNLOAD_STATUS.downloaded,
        }));
        return;
      }
      if (downloadControllersRef.current[sound.id]) return;

      const remoteUrl = builtinSoundUrl(sound);
      const controller = new AbortController();
      downloadControllersRef.current[sound.id] = controller;
      setDownloadStatuses((current) => ({
        ...current,
        [sound.id]: BUILTIN_SOUND_DOWNLOAD_STATUS.downloading,
      }));
      setError(null);
      try {
        const response = await fetch(remoteUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to download audio: ${response.status}`);
        const cache = await caches.open(AUDIO_CACHE_NAME);
        await cache.put(remoteUrl, response);
        markSoundCached(remoteUrl);
        setDownloadStatuses((current) => ({
          ...current,
          [sound.id]: BUILTIN_SOUND_DOWNLOAD_STATUS.downloaded,
        }));
      } catch (downloadError) {
        if (controller.signal.aborted) return;
        setDownloadStatuses((current) => ({
          ...current,
          [sound.id]: BUILTIN_SOUND_DOWNLOAD_STATUS.failed,
        }));
        setError('Sound download failed. Try again.');
      } finally {
        delete downloadControllersRef.current[sound.id];
      }
    },
    [sounds, builtinSoundUrl, markSoundCached],
  );

  const removeCustomSound = useCallback(
    async (soundKey: string) => {
      const sound = sounds.find((item) => item.id === soundKey);
      if (!sound || sound.source === 'BUILTIN') return;
      await api.deleteFocusSound(sound.id);
      if (settings.selectedSoundKey === sound.id) {
        const fallback =
          sounds.find((item) => item.id !== sound.id)?.id ?? DEFAULT_FOCUS_AUDIO_SETTINGS.selectedSoundKey;
        persist({ ...settings, selectedSoundKey: fallback });
        stop();
      }
      await queryClient.invalidateQueries({ queryKey: ['focus', 'sounds'] });
    },
    [persist, queryClient, settings, sounds, stop],
  );

  const renameCustomSound = useCallback(
    async (soundKey: string, name: string) => {
      const sound = sounds.find((item) => item.id === soundKey);
      if (!sound || sound.source === 'BUILTIN') return;
      const updated = await api.updateFocusSound(sound.id, { name });
      queryClient.setQueryData<{ sounds: FocusSound[]; preferences: unknown[] }>(['focus', 'sounds'], (current) => {
        if (!current) return current;
        const nextSounds = current.sounds.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
        saveFocusSoundCatalog(nextSounds);
        return { ...current, sounds: nextSounds };
      });
      await queryClient.invalidateQueries({ queryKey: ['focus', 'sounds'] });
    },
    [queryClient, sounds],
  );

  const value = useMemo<FocusAudioContextValue>(
    () => ({
      sounds,
      settings,
      selectedSound,
      isPlaying,
      playbackPosition,
      playbackDuration,
      error,
      cachedSoundKeys,
      downloadStatuses,
      setEnabled,
      setSelectedSound,
      setVolume,
      setMuted,
      startFromGesture,
      pause,
      resume,
      stop,
      seek,
      preview,
      downloadSound,
      renameCustomSound,
      removeCustomSound,
    }),
    [
      cachedSoundKeys,
      downloadStatuses,
      error,
      isPlaying,
      pause,
      playbackDuration,
      playbackPosition,
      preview,
      resume,
      seek,
      selectedSound,
      setEnabled,
      setMuted,
      setSelectedSound,
      setVolume,
      settings,
      sounds,
      startFromGesture,
      stop,
      downloadSound,
      renameCustomSound,
      removeCustomSound,
    ],
  );

  return <FocusAudioContext.Provider value={value}>{children}</FocusAudioContext.Provider>;
}

export function useFocusAudio() {
  const context = useContext(FocusAudioContext);
  if (!context) throw new Error('useFocusAudio must be used within FocusAudioProvider');
  return context;
}
