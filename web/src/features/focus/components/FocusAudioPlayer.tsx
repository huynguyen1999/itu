import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Maximize2, Minimize2, Music, Pause, Play, Square, Volume1, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusAudio } from './FocusAudioProvider';

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Generate a stable pseudorandom waveform height array derived from a sound key. */
function getWaveformHeights(key: string, count = 52): number[] {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  let seed = Math.abs(hash) || 7;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  }
  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = 6 + Math.sin(i / 4.2) * 8 + rand() * 14;
    heights.push(Math.max(6, Math.min(38, Math.round(base))));
  }
  return heights;
}

/** Full Ambient Audio Player Card used in settings modal */
export function FocusAudioPlayerCard({
  className,
  onClickHeader,
  onToggleCompact,
}: {
  className?: string;
  onClickHeader?: () => void;
  onToggleCompact?: () => void;
}) {
  const audio = useFocusAudio();

  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [volOpen, setVolOpen] = useState(false);
  const volContainerRef = useRef<HTMLDivElement>(null);

  const selectedSoundIsBuiltin = audio.selectedSound?.source === 'BUILTIN';
  const selectedSoundIsCached = audio.selectedSound ? audio.cachedSoundKeys.has(audio.selectedSound.url) : false;
  const selectedSoundDownloadStatus = audio.selectedSound ? audio.downloadStatuses[audio.selectedSound.id] : undefined;
  const selectedSoundIsDownloading = selectedSoundDownloadStatus === 'downloading';

  const soundNeedsDownload = Boolean(
    audio.settings.enabled &&
      selectedSoundIsBuiltin &&
      !selectedSoundIsCached &&
      selectedSoundDownloadStatus !== 'downloaded',
  );

  const duration =
    Number.isFinite(audio.playbackDuration) && audio.playbackDuration > 0 ? audio.playbackDuration : 0;
  const visiblePosition = scrubPosition ?? audio.playbackPosition;
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, visiblePosition / duration)) : 0;

  const waveformHeights = useMemo(() => {
    return getWaveformHeights(audio.selectedSound?.id ?? 'default-track', 52);
  }, [audio.selectedSound?.id]);

  const activeBarCount = Math.round(progressRatio * waveformHeights.length);

  // Close volume popover when clicking outside
  useEffect(() => {
    if (!volOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (volContainerRef.current && !volContainerRef.current.contains(e.target as Node)) {
        setVolOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [volOpen]);

  // Scrub handler for waveform
  const handleScrubPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!duration || !audio.settings.enabled) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setScrubPosition(ratio * duration);
    },
    [audio.settings.enabled, duration],
  );

  // Volume slider handler
  const handleVolumePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clientY = e.clientY;
      const ratio = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
      audio.setVolume(ratio);
    },
    [audio],
  );

  const statusLabel = useMemo(() => {
    if (!audio.settings.enabled) return 'Sound disabled';
    if (selectedSoundIsDownloading) return 'Downloading sound...';
    if (!audio.selectedSound) return 'No sound selected';
    const filename = audio.selectedSound.originalName || audio.selectedSound.name || 'audio.wav';
    return audio.isPlaying ? `Playing · ${filename}` : `Paused · ${filename}`;
  }, [audio.settings.enabled, audio.isPlaying, audio.selectedSound, selectedSoundIsDownloading]);

  const volumePercent = Math.round((audio.settings.muted ? 0 : audio.settings.volume) * 100);

  return (
    <div
      aria-label="Background sound player"
      className={cn(
        'relative overflow-visible rounded-3xl p-6 transition-all duration-300',
        'bg-gradient-to-br from-[#0f211c] via-[#0b1a16] to-[#071410]',
        'border border-[#1c352c]',
        'shadow-[0_40px_80px_-30px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.03)]',
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-3xl before:bg-[radial-gradient(ellipse_at_top_left,rgba(82,232,196,0.07),transparent_60%)]',
        className,
      )}
    >
      {/* Header */}
      <div className="relative z-10 mb-5 flex items-center justify-between gap-3">
        <div
          onClick={onClickHeader}
          className={cn(
            'flex items-center gap-3',
            onClickHeader && 'cursor-pointer group select-none',
          )}
        >
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-[#1c352c] bg-gradient-to-br from-[#163a30] to-[#0d211b] text-[#52e8c4] shadow-sm transition-transform group-hover:scale-105">
            <Music className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#7fa89c]">
              Background sound
            </div>
            <div className="font-sans text-[15px] font-semibold text-[#eaf4ef] group-hover:text-[#52e8c4] transition-colors">
              {audio.selectedSound?.name ?? 'Select track'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onToggleCompact && (
            <button
              type="button"
              onClick={onToggleCompact}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1c352c] bg-[#0f211c] text-[#7fa89c] transition-all hover:border-[#52e8c4] hover:text-[#52e8c4]"
              title="Compact audio player"
              aria-label="Compact audio player"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Toggle Switch */}
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <span className="sr-only">Enable background sound</span>
            <input
              type="checkbox"
              role="switch"
              checked={audio.settings.enabled}
              onChange={(e) => audio.setEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-6 w-11 rounded-full bg-white/15 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-[#d9ebe6] after:shadow-sm after:transition-transform after:duration-200 peer-checked:bg-[#52e8c4] peer-checked:after:translate-x-5 peer-checked:after:bg-[#082019] peer-focus-visible:ring-2 peer-focus-visible:ring-[#52e8c4] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0a1512]" />
          </label>
        </div>
      </div>

      {/* Status Row */}
      <div className="relative z-10 mb-4 flex items-center gap-2 text-[11.5px] font-medium text-[#7fa89c]">
        <span
          className={cn(
            'h-2 w-2 rounded-full transition-all duration-300',
            audio.isPlaying && audio.settings.enabled
              ? 'bg-[#52e8c4] shadow-[0_0_8px_#52e8c4]'
              : 'bg-[#4c6a61]',
          )}
        />
        <span className="truncate">{statusLabel}</span>
      </div>

      {/* Waveform Scrubber */}
      <div
        role="slider"
        tabIndex={audio.settings.enabled && duration > 0 ? 0 : -1}
        aria-label="Audio waveform scrubber"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(visiblePosition)}
        aria-valuetext={`${formatAudioTime(visiblePosition)} of ${formatAudioTime(duration)}`}
        className={cn(
          'relative z-10 mb-2.5 h-[52px] w-full select-none touch-none',
          audio.settings.enabled && duration > 0 ? 'cursor-pointer' : 'cursor-default opacity-40',
        )}
        onPointerDown={(e) => {
          if (!duration || !audio.settings.enabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          handleScrubPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            handleScrubPointer(e);
          }
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            if (scrubPosition !== null) {
              audio.seek(scrubPosition);
              setScrubPosition(null);
            }
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => setScrubPosition(null)}
      >
        {/* Bars */}
        <div className="flex h-full w-full items-center gap-[3px]">
          {waveformHeights.map((height, i) => {
            const isActive = i < activeBarCount && audio.settings.enabled;
            const isPlayingBar = isActive && audio.isPlaying;
            return (
              <span
                key={i}
                style={{ height: `${height}px` }}
                className={cn(
                  'min-w-[2px] flex-1 rounded-[2px] transition-colors duration-150',
                  isActive ? 'bg-[#52e8c4]' : 'bg-[#1c352c]',
                  isPlayingBar && 'animate-[bounce_1.1s_ease-in-out_infinite]',
                )}
              />
            );
          })}
        </div>

        {/* Scrub Handle */}
        {duration > 0 && (
          <div
            className="pointer-events-none absolute top-0 h-full w-[2px] bg-[#52e8c4] shadow-[0_0_10px_rgba(82,232,196,0.7)]"
            style={{ left: `${progressRatio * 100}%` }}
          >
            <div className="absolute left-1/2 top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#52e8c4] shadow-[0_0_0_4px_rgba(82,232,196,0.18)]" />
          </div>
        )}
      </div>

      {/* Time Row */}
      <div className="relative z-10 mb-6 flex justify-between font-mono text-[11px] text-[#7fa89c]">
        <span className="text-[#52e8c4] font-medium">{formatAudioTime(visiblePosition)}</span>
        <span>{formatAudioTime(duration)}</span>
      </div>

      {/* Controls Row */}
      <div className="relative z-10 flex items-center justify-center gap-4">
        {/* Download offline button if needed */}
        {soundNeedsDownload && (
          <button
            type="button"
            disabled={selectedSoundIsDownloading}
            onClick={() => audio.selectedSound && void audio.downloadSound(audio.selectedSound.id)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1c352c] bg-[#0f211c] text-[#7fa89c] transition-all hover:border-[#52e8c4] hover:text-[#eaf4ef] disabled:opacity-40"
            title="Download sound for offline use"
            aria-label="Download sound"
          >
            {selectedSoundIsDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#52e8c4]" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Stop button */}
        <button
          type="button"
          disabled={!audio.settings.enabled || (!audio.isPlaying && audio.playbackPosition <= 0)}
          onClick={audio.stop}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1c352c] bg-[#0f211c] text-[#7fa89c] transition-all hover:border-[#2c6e5f] hover:text-[#eaf4ef] disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Stop audio"
          title="Stop playback"
        >
          <Square className="h-3.5 w-3.5" />
        </button>

        {/* Main Play / Pause Button */}
        <button
          type="button"
          disabled={!audio.settings.enabled || !audio.selectedSound}
          onClick={() => {
            if (audio.isPlaying) {
              audio.pause();
            } else {
              void audio.resume();
            }
          }}
          className={cn(
            'flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full',
            'bg-gradient-to-br from-[#52e8c4] to-[#2fb894]',
            'shadow-[0_10px_24px_-8px_rgba(82,232,196,0.55)]',
            'transition-transform duration-150 hover:scale-[1.05] active:scale-[0.96]',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100',
          )}
          aria-label={audio.isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {audio.isPlaying ? (
            <Pause className="h-5 w-5 fill-[#082019] text-[#082019]" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-[#082019] text-[#082019]" />
          )}
        </button>

        {/* Volume Popover Anchor */}
        <div ref={volContainerRef} className="relative">
          {/* Popover */}
          <div
            className={cn(
              'absolute bottom-[calc(100%+12px)] left-1/2 flex h-[132px] w-[44px] -translate-x-1/2 flex-col items-center gap-2 rounded-2xl p-3 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] transition-all duration-200',
              'border border-[#1c352c] bg-gradient-to-b from-[#132a23] to-[#0b1a16]',
              'after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-6 after:border-transparent after:border-t-[#0b1a16]',
              volOpen ? 'pointer-events-auto opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2',
            )}
          >
            <span className="font-mono text-[10px] font-medium text-[#52e8c4]">
              {volumePercent}%
            </span>
            <div
              role="slider"
              aria-label="Volume slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={volumePercent}
              className="relative w-1 flex-1 cursor-pointer rounded-full bg-[#1c352c] touch-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handleVolumePointer(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  handleVolumePointer(e);
                }
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
            >
              <div
                className="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-[#2c6e5f] to-[#52e8c4] after:absolute after:-top-[5px] after:left-1/2 after:h-[11px] after:w-[11px] after:-translate-x-1/2 after:rounded-full after:bg-[#52e8c4] after:shadow-[0_0_0_4px_rgba(82,232,196,0.18)]"
                style={{ height: `${volumePercent}%` }}
              />
            </div>
          </div>

          {/* Volume Trigger Button */}
          <button
            type="button"
            onClick={() => setVolOpen(!volOpen)}
            className={cn(
              'flex h-[38px] w-[38px] items-center justify-center rounded-full border transition-all duration-150',
              volOpen
                ? 'border-[#2c6e5f] bg-[#0d211b] text-[#52e8c4]'
                : 'border-[#1c352c] bg-[#0f211c] text-[#7fa89c] hover:border-[#2c6e5f] hover:text-[#eaf4ef]',
            )}
            aria-label="Toggle volume slider"
          >
            {audio.settings.muted || audio.settings.volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : audio.settings.volume < 0.5 ? (
              <Volume1 className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sleek Sound Chip Pill for Focus View */
export function FocusAudioPill({
  onClickSettings,
  onToggleExpand,
  className,
}: {
  onClickSettings?: () => void;
  onToggleExpand?: () => void;
  className?: string;
}) {
  const audio = useFocusAudio();

  const selectedSoundIsBuiltin = audio.selectedSound?.source === 'BUILTIN';
  const selectedSoundIsCached = audio.selectedSound ? audio.cachedSoundKeys.has(audio.selectedSound.url) : false;
  const selectedSoundDownloadStatus = audio.selectedSound ? audio.downloadStatuses[audio.selectedSound.id] : undefined;
  const selectedSoundIsDownloading = selectedSoundDownloadStatus === 'downloading';

  const soundNeedsDownload = Boolean(
    audio.settings.enabled &&
      selectedSoundIsBuiltin &&
      !selectedSoundIsCached &&
      selectedSoundDownloadStatus !== 'downloaded',
  );

  const statusText = audio.isPlaying ? 'Playing' : 'Paused';

  return (
    <div
      className={cn(
        'mx-auto mb-5 flex w-fit max-w-full items-center gap-2 sm:gap-2.5 rounded-full px-3 sm:px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
        'border border-[#1c352c] bg-gradient-to-r from-[#0f211c] to-[#0a1815] text-[#eaf4ef]',
        'shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5)] hover:border-[#2c6e5f]',
        className,
      )}
    >
      {/* Equalizer & Audio info button */}
      <button
        type="button"
        onClick={onClickSettings}
        className="flex min-w-0 items-center gap-2 sm:gap-2.5 rounded-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#52e8c4]"
        aria-label="Open focus sound settings"
      >
        {/* Animated Equalizer bars */}
        <span className="flex h-3 items-end gap-[3px] shrink-0">
          <span
            className={cn(
              'h-[40%] w-[3px] rounded-[1px] bg-[#52e8c4]',
              audio.isPlaying && 'animate-[bounce_1.1s_ease-in-out_infinite]',
            )}
          />
          <span
            className={cn(
              'h-[100%] w-[3px] rounded-[1px] bg-[#52e8c4]',
              audio.isPlaying && 'animate-[bounce_1.1s_ease-in-out_infinite_0.15s]',
            )}
          />
          <span
            className={cn(
              'h-[65%] w-[3px] rounded-[1px] bg-[#52e8c4]',
              audio.isPlaying && 'animate-[bounce_1.1s_ease-in-out_infinite_0.3s]',
            )}
          />
        </span>

        {/* Volume Icon */}
        {audio.settings.muted ? (
          <VolumeX className="h-3.5 w-3.5 shrink-0 text-[#7fa89c]" />
        ) : (
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-[#52e8c4]" />
        )}

        {/* Label */}
        <span className="flex min-w-0 items-center gap-1 text-[11px] sm:text-[12px] text-[#7fa89c]">
          <span className="hidden xs:inline">{statusText}</span>
          <strong className="font-semibold text-[#eaf4ef] truncate max-w-[70px] xs:max-w-[100px] sm:max-w-[130px]">
            {audio.selectedSound?.name ?? 'dummy'}
          </strong>
        </span>
      </button>

      {/* Offline Download button */}
      {soundNeedsDownload && (
        <button
          type="button"
          disabled={selectedSoundIsDownloading}
          onClick={() => audio.selectedSound && void audio.downloadSound(audio.selectedSound.id)}
          className="grid h-6 w-6 place-items-center rounded-full border border-[#1c352c] bg-[#0d211b] text-[#7fa89c] hover:text-[#52e8c4] disabled:opacity-50"
          title="Download sound"
          aria-label="Download sound"
        >
          {selectedSoundIsDownloading ? (
            <Loader2 className="h-3 w-3 animate-spin text-[#52e8c4]" />
          ) : (
            <Download className="h-3 w-3" />
          )}
        </button>
      )}

      {/* Quick Play/Pause circle button */}
      {audio.settings.enabled && audio.selectedSound && (
        <button
          type="button"
          onClick={() => {
            if (audio.isPlaying) {
              audio.pause();
            } else {
              void audio.resume();
            }
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1c352c] bg-[#163a30] text-[#52e8c4] transition-transform hover:scale-105 active:scale-95"
          aria-label={audio.isPlaying ? 'Pause focus sound' : 'Play focus sound'}
        >
          {audio.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
        </button>
      )}

      {/* Expand to full player button */}
      {onToggleExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1c352c] bg-[#0f211c] text-[#7fa89c] transition-all hover:border-[#52e8c4] hover:text-[#52e8c4]"
          title="Expand audio player"
          aria-label="Expand audio player"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
