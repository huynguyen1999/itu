import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  Bell,
  Check,
  Download,
  Loader2,
  Pause,
  Pencil,
  Play,
  Square,
  Volume2,
  PlayCircle,
  Trash2,
  Upload,
  VolumeX,
  X,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { cn } from '@/lib/utils';
import { useFocusAudio } from './FocusAudioProvider';
import { FocusAudioPlayerCard } from './FocusAudioPlayer';
import { saveFocusSoundCatalog } from '../sounds';
import type { FocusSound, FocusSoundPreference } from '@/shared/api/types';
import {
  DEFAULT_FOCUS_SETTINGS,
  getStoredFocusSettings,
  saveStoredFocusSettings,
  type FocusUserSettings,
} from '@/shared/utils/focusSettings';

export {
  DEFAULT_FOCUS_SETTINGS,
  getStoredFocusSettings,
  saveStoredFocusSettings,
  type FocusUserSettings,
} from '@/shared/utils/focusSettings';

interface FocusSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange?: (settings: FocusUserSettings) => void;
}

export function FocusSettingsModal({ open, onOpenChange, onSettingsChange }: FocusSettingsModalProps) {
  const [settings, setSettings] = useState<FocusUserSettings>(getStoredFocusSettings);
  const audio = useFocusAudio();
  const queryClient = useQueryClient();
  const [uploadName, setUploadName] = useState('');
  const [removingSoundId, setRemovingSoundId] = useState<string | null>(null);
  const [editingSoundId, setEditingSoundId] = useState<string | null>(null);
  const [editingSoundName, setEditingSoundName] = useState('');
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);

  const upload = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => api.uploadFocusSound(name, file),
    onSuccess: (sound) => {
      setUploadName('');
      queryClient.setQueryData<{ sounds: FocusSound[]; preferences: FocusSoundPreference[] }>(
        ['focus', 'sounds'],
        (current) => {
          const sounds = [sound, ...(current?.sounds.filter((item) => item.id !== sound.id) ?? [])];
          saveFocusSoundCatalog(sounds);
          return { sounds, preferences: current?.preferences ?? [] };
        },
      );
      audio.setSelectedSound(sound.id);
      void queryClient.invalidateQueries({ queryKey: ['focus', 'sounds'] });
    },
  });

  const renameSound = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => audio.renameCustomSound(id, name),
    onSuccess: () => {
      setEditingSoundId(null);
      setEditingSoundName('');
    },
  });

  const builtinSounds = audio.sounds.filter((sound) => sound.source === 'BUILTIN');
  const uploadedSounds = audio.sounds.filter((sound) => sound.source !== 'BUILTIN');
  const volumePercent = Math.round(audio.settings.volume * 100);
  const playbackDuration = Math.max(0, audio.playbackDuration);
  const playbackPosition = Math.min(Math.max(0, audio.playbackPosition), playbackDuration || 0);
  const visiblePlaybackPosition = scrubPosition ?? playbackPosition;
  const playbackPercent = playbackDuration > 0 ? Math.round((visiblePlaybackPosition / playbackDuration) * 100) : 0;
  const playbackStatus = !audio.settings.enabled
    ? 'Off'
    : audio.isPlaying
      ? 'Playing'
      : playbackPosition > 0
        ? 'Paused'
        : 'Ready';

  const clampPlaybackPosition = (value: number) => {
    return Math.min(Math.max(0, value), playbackDuration || 0);
  };

  const seekPlaybackPosition = (value: number) => {
    audio.seek(clampPlaybackPosition(value));
  };

  const getPlaybackPositionFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!playbackDuration) return 0;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    return clampPlaybackPosition(ratio * playbackDuration);
  };

  const handlePlaybackKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!playbackDuration) return;
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      seekPlaybackPosition(visiblePlaybackPosition - step);
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      seekPlaybackPosition(visiblePlaybackPosition + step);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      seekPlaybackPosition(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      seekPlaybackPosition(playbackDuration);
    }
  };

  const startEditingSound = (sound: FocusSound) => {
    setEditingSoundId(sound.id);
    setEditingSoundName(sound.name);
  };

  const saveEditedSoundName = () => {
    if (!editingSoundId) return;
    const name = editingSoundName.trim();
    if (!name) return;
    renameSound.mutate({ id: editingSoundId, name });
  };

  const cancelEditingSound = () => {
    setEditingSoundId(null);
    setEditingSoundName('');
  };

  const selectSound = (sound: FocusSound) => {
    if (audio.isPlaying) {
      void audio.preview(sound.id);
      return;
    }
    audio.setSelectedSound(sound.id);
  };

  const renderSoundRow = (sound: FocusSound) => {
    const downloadStatus = audio.downloadStatuses[sound.id];
    const isDownloading = downloadStatus === 'downloading';
    const isDownloaded = audio.cachedSoundKeys.has(sound.url) || downloadStatus === 'downloaded';
    const downloadFailed = downloadStatus === 'failed';
    const isRemoving = removingSoundId === sound.id;
    const isEditing = editingSoundId === sound.id;
    const isRenaming = renameSound.isPending && renameSound.variables?.id === sound.id;
    const isSelected = audio.selectedSound?.id === sound.id;

    return (
      <div
        key={sound.id}
        className={cn(
          'flex min-h-10 items-center gap-2 rounded-[var(--itu-radius-s)] px-2 py-1.5 transition-[background-color,box-shadow,color] duration-150',
          isSelected
            ? 'bg-[var(--itu-mint-50)] text-[var(--itu-teal-700)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--itu-teal-500)_32%,transparent)]'
            : 'hover:bg-muted/70',
        )}
      >
        {isEditing ? (
          <input
            type="text"
            value={editingSoundName}
            onChange={(event) => setEditingSoundName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveEditedSoundName();
              if (event.key === 'Escape') cancelEditingSound();
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs font-medium"
            aria-label={`Edit ${sound.name} name`}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 rounded-md text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => selectSound(sound)}
            aria-pressed={isSelected}
          >
            <span className={cn('block truncate', isSelected ? 'text-[var(--itu-teal-700)]' : 'text-foreground')}>
              {sound.name}
            </span>
            {sound.source === 'BUILTIN' && (
              <span className="block text-[10px] font-medium text-muted-foreground">
                {isDownloading
                  ? 'Downloading...'
                  : isDownloaded
                    ? 'Downloaded'
                    : downloadFailed
                      ? 'Download failed'
                      : 'Not downloaded'}
              </span>
            )}
          </button>
        )}
        {isEditing ? (
          <>
            <button
              type="button"
              disabled={isRenaming || !editingSoundName.trim()}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-70"
              onClick={saveEditedSoundName}
              aria-label={`Save ${sound.name} name`}
              title="Save name"
            >
              {isRenaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              disabled={isRenaming}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-70"
              onClick={cancelEditingSound}
              aria-label="Cancel rename"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            {sound.source === 'BUILTIN' && !isDownloaded ? (
              <button
                type="button"
                disabled={isDownloading}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-70"
                onClick={() => void audio.downloadSound(sound.id)}
                aria-label={`Download ${sound.name} for offline use`}
                title={isDownloading ? 'Downloading' : 'Download for offline use'}
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </button>
            ) : sound.source === 'BUILTIN' ? (
              <div className="flex h-6 w-6 items-center justify-center">
                <Check className="h-3.5 w-3.5 text-[var(--itu-teal-600)]" aria-label="Downloaded" />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => startEditingSound(sound)}
                  aria-label={`Rename ${sound.name}`}
                  title="Rename uploaded sound"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isRemoving}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-wait disabled:opacity-70"
                  onClick={() => {
                    setRemovingSoundId(sound.id);
                    void audio.removeCustomSound(sound.id).finally(() => setRemovingSoundId(null));
                  }}
                  aria-label={`Delete ${sound.name}`}
                  title={isRemoving ? 'Removing' : 'Remove uploaded sound'}
                >
                  {isRemoving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </>
            )}
          </>
        )}
      </div>
    );
  };
  useEffect(() => {
    if (open) {
      setSettings(getStoredFocusSettings());
    }
  }, [open]);

  const updateSetting = <K extends keyof FocusUserSettings>(key: K, value: FocusUserSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveStoredFocusSettings(updated);
    onSettingsChange?.(updated);
  };

  const handleToggleNotification = async (checked: boolean) => {
    if (checked && 'Notification' in window && Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      if (res !== 'granted') {
        updateSetting('notificationEnabled', false);
        return;
      }
    }
    updateSetting('notificationEnabled', checked);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card text-card-foreground border border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">Focus Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-3">
            <FocusAudioPlayerCard />
            {audio.error && <p className="text-xs text-destructive">{audio.error}</p>}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sound library</p>
              <div className="rounded-md border border-border/60">
                <div className="border-b border-border/60 bg-muted/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Built-in
                </div>
                <div className="py-1">{builtinSounds.map(renderSoundRow)}</div>
                <div className="border-y border-border/60 bg-muted/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Your uploads
                </div>
                <div className="py-1">
                  {uploadedSounds.length > 0 ? (
                    uploadedSounds.map(renderSoundRow)
                  ) : (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">No uploaded sounds yet.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={uploadName}
                onChange={(event) => setUploadName(event.target.value)}
                placeholder="Uploaded sound name"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                aria-label="Uploaded sound name"
              />
              <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold hover:bg-muted">
                <Upload className="h-3.5 w-3.5" />
                MP3
                <input
                  type="file"
                  accept="audio/mpeg,.mp3"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload.mutate({ name: uploadName.trim() || file.name.replace(/\.mp3$/i, ''), file });
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
            {upload.isPending && <p className="text-xs text-muted-foreground">Uploading sound…</p>}
            {upload.isError && <p className="text-xs text-destructive">Sound upload failed. Try again.</p>}
          </div>
          {/* Overtime Setting */}
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
                <PlayCircle className="h-4 w-4 text-primary" />
                Default timer length
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Used when opening Focus before choosing a custom duration.
              </p>
            </div>
            <input
              type="number"
              min="1"
              max="180"
              value={settings.defaultWorkMinutes}
              onChange={(e) =>
                updateSetting('defaultWorkMinutes', Math.max(1, Math.min(180, Number(e.target.value) || 30)))
              }
              className="mt-1 h-9 w-20 rounded-md border border-border bg-background px-2 text-sm font-semibold"
            />
          </div>

          {/* Overtime Setting */}
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
                <PlayCircle className="h-4 w-4 text-primary" />
                Auto-continue overtime after timer ends
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When countdown reaches 00:00, notify and keep counting upward (+MM:SS) until you press Stop.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoContinueOvertime}
              onChange={(e) => updateSetting('autoContinueOvertime', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
          </div>

          {/* Audio Chime Setting */}
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
                <Volume2 className="h-4 w-4 text-primary" />
                Sound notification on finish
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Play a pleasant chime audio when your focus countdown reaches zero.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => updateSetting('soundEnabled', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
          </div>

          {/* Browser Notification Setting */}
          <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
                <Bell className="h-4 w-4 text-primary" />
                Desktop browser notification
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Show system popup alert when focus session completes.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notificationEnabled}
              onChange={(e) => handleToggleNotification(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Save & Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
