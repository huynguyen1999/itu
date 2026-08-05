import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  ListTodo,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Search,
  Square,
  TimerReset,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type { FocusSession } from '@/shared/api/types';
import { createUlid } from '@/shared/sync/syncIdentity';
import { useSync } from '@/shared/sync/SyncProvider';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/PageHeader';
import { createOptimisticFocusSession, focusDisplaySeconds, formatFocusTime, parseDurationInput, validFocusMinutes } from './utils/focusTimer';
import { playFinishChime } from '@/shared/utils/sound';
import {
  FocusSettingsModal,
  DEFAULT_FOCUS_SETTINGS,
  getStoredFocusSettings,
  type FocusUserSettings,
} from './components/FocusSettingsModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useFocusAudio } from './components/FocusAudioProvider';
import { FocusAudioPill, FocusAudioPlayerCard } from './components/FocusAudioPlayer';

/* ───────────────────────────────────────────
   Direction contract (Focus surface redesign)
   THESIS: The timer dial is the gravitational center; the surface refuses crowded panels in favor of a spacious, meditative single-task experience.
   OWN-WORLD: Teal tokens (--itu-teal-*), Manrope display, IBM Plex Mono for timer/meta, shadcn Card + Button, --itu-shadow-card, ambient page gradient.
   STORY: Set duration → pick task → start → deep work. Sound chip confirms ambient mix. Stats + records sit quietly in the right column.
   FIRST VIEWPORT: Two-column grid; left = timer card with mode tabs, SVG dial (280px, 60 ticks, gradient ring), task/sound chips, action buttons. Right = 4-stat grid + collapsible day-grouped records with search & merge toggle.
   FORM: Extended existing surface inside the app's established teal/mint visual world.
   ─────────────────────────────────────────── */

/* Helper: generate 60 tick marks for the SVG dial */
function DialTicks({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const ticks: React.ReactNode[] = [];
  const rInnerMajor = r * 0.84;
  const rInnerMinor = r * 0.9;
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
    const major = i % 5 === 0;
    const rIn = major ? rInnerMajor : rInnerMinor;
    const x1 = cx + rIn * Math.cos(angle);
    const y1 = cy + rIn * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={major ? 'var(--itu-ink-faint)' : 'var(--itu-border)'}
        strokeWidth={major ? 2.2 : 1.5}
        strokeLinecap="round"
      />,
    );
  }
  return <g>{ticks}</g>;
}

function eventKey() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

/* ───────────────────────────────────────────
   Focus page component
   ─────────────────────────────────────────── */
export function FocusPage() {
  const queryClient = useQueryClient();
  const { growthReceipts } = useSync();
  const audio = useFocusAudio();
  const [search] = useSearchParams();
  const [selectedTask, setSelectedTask] = useState(search.get('task') ?? '');
  const [customTitle, setCustomTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editingSession, setEditingSession] = useState<FocusSession | null>(null);
  const [lastCompletedSession, setLastCompletedSession] = useState<FocusSession | null>(null);
  const [editStartedAt, setEditStartedAt] = useState('');
  const [editCompletedAt, setEditCompletedAt] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const isTimeRangeInvalid = Boolean(editStartedAt && editCompletedAt && new Date(editCompletedAt) <= new Date(editStartedAt));
  const [userSettings, setUserSettings] = useState<FocusUserSettings>(getStoredFocusSettings);
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState(() => getStoredFocusSettings().defaultWorkMinutes * 60);
  const [editMinutes, setEditMinutes] = useState(String(getStoredFocusSettings().defaultWorkMinutes));
  const [editSeconds, setEditSeconds] = useState('00');
  const timeEditContainerRef = useRef<HTMLDivElement>(null);
  const secondsInputRef = useRef<HTMLInputElement>(null);
  const [, tick] = useState(0);

  const [isAudioCompact, setIsAudioCompact] = useState(() => {
    try {
      return localStorage.getItem('itu.focus.audio-compact') === 'true';
    } catch {
      return false;
    }
  });

  const toggleAudioCompact = (compact: boolean) => {
    setIsAudioCompact(compact);
    try {
      localStorage.setItem('itu.focus.audio-compact', String(compact));
    } catch {
      // Storage optional
    }
  };

  /* Mode tabs: Focus | Short Break | Long Break */
  type TimerMode = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';
  const [timerMode, setTimerMode] = useState<TimerMode>('FOCUS');

  const MODE_SECONDS: Record<TimerMode, number> = {
    FOCUS: selectedDurationSeconds,
    SHORT_BREAK: 5 * 60,
    LONG_BREAK: 15 * 60,
  };

  /* Merge toggle & search for session records */
  const [mergeShort, setMergeShort] = useState(true);
  const [recordSearch, setRecordSearch] = useState('');
  const [visibleDayCount, setVisibleDayCount] = useState(3);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  const notificationFiredRef = useRef<Record<string, boolean>>({});

  const active = useQuery({ queryKey: ['focus', 'active'], queryFn: () => api.activeFocus() });
  const tasks = useQuery({ queryKey: ['tasks', 'focusable'], queryFn: () => api.tasks({ view: 'all' }) });
  const history = useQuery({ queryKey: ['focus', 'history'], queryFn: () => api.focusHistory() });
  const summary = useQuery({ queryKey: ['focus', 'summary'], queryFn: () => api.focusSummary() });

  useEffect(() => {
    const stored = getStoredFocusSettings();
    setUserSettings(stored);
    setSelectedDurationSeconds(stored.defaultWorkMinutes * 60);
    setEditMinutes(String(stored.defaultWorkMinutes));
    setEditSeconds('00');
  }, []);

  // 1-second timer tick
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const displaySeconds = active.data
    ? focusDisplaySeconds(active.data, userSettings.autoContinueOvertime)
    : MODE_SECONDS[timerMode];
  const selectedSoundIsBuiltin = audio.selectedSound?.source === 'BUILTIN';
  const selectedSoundIsCached = audio.selectedSound ? audio.cachedSoundKeys.has(audio.selectedSound.url) : false;
  const selectedSoundDownloadStatus = audio.selectedSound ? audio.downloadStatuses[audio.selectedSound.id] : undefined;
  const selectedSoundIsDownloading = selectedSoundDownloadStatus === 'downloading';
  const selectedSoundJustDownloaded = selectedSoundDownloadStatus === 'downloaded';
  const soundNeedsDownload = Boolean(
    audio.settings.enabled && selectedSoundIsBuiltin && !selectedSoundIsCached && !selectedSoundJustDownloaded,
  );
  const soundStatusLabel = getSoundStatusLabel(audio.settings.enabled, audio.settings.muted, audio.isPlaying, selectedSoundIsDownloading, selectedSoundIsCached || selectedSoundJustDownloaded, soundNeedsDownload);
  const canControlAudio = Boolean(audio.settings.enabled && audio.selectedSound);

  // Check finish notification / chime
  useEffect(() => {
    if (!active.data || active.data.mode !== 'COUNTDOWN' || active.data.status !== 'ACTIVE') return;
    const sessionKey = `${active.data.id}:${active.data.cycle}`;
    if (displaySeconds <= 0 && !notificationFiredRef.current[sessionKey]) {
      notificationFiredRef.current[sessionKey] = true;
      if (userSettings.soundEnabled) {
        playFinishChime();
      }
      if (userSettings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Focus Timer Complete! 🎯', {
            body: `Task: ${active.data.taskTitleSnapshot || 'Focus Session'}`,
            icon: '/favicon.ico',
            requireInteraction: true,
            silent: false,
          });
        } catch {
          // ignore
        }
      }
    }
  }, [displaySeconds, active.data, userSettings]);

  const start = useMutation({
    mutationFn: ({ optimistic, idempotencyKey }: { optimistic: FocusSession; idempotencyKey: string }) =>
      api.startFocus(
        {
          taskId: optimistic.taskId ?? undefined,
          customTitle: optimistic.customTitle ?? undefined,
          mode: 'COUNTDOWN',
          plannedSeconds: optimistic.plannedSeconds ?? undefined,
          ownerDeviceId: 'web',
          idempotencyKey,
        },
        optimistic,
      ),
    onMutate: async ({ optimistic }) => {
      const previous = queryClient.getQueryData<FocusSession | null>(['focus', 'active']);
      const cancellation = queryClient.cancelQueries({ queryKey: ['focus', 'active'] });
      queryClient.setQueryData(['focus', 'active'], optimistic);
      await cancellation;
      return { previous };
    },
    onSuccess: (session) => {
      setSelectedTask(session.taskId ?? '');
      queryClient.setQueryData(['focus', 'active'], session);
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(['focus', 'active'], context?.previous ?? null);
    },
  });

  const action = useMutation({
    mutationFn: ({
      operation,
      category,
      extendSeconds,
      session,
      idempotencyKey,
      expectedVersion,
    }: {
      operation: 'pause' | 'resume' | 'complete' | 'abandon' | 'extend';
      category?: string;
      extendSeconds?: number;
      session: FocusSession;
      idempotencyKey: string;
      expectedVersion: number;
    }) => {
      return api.focusAction(
        session.id,
        operation,
        {
          idempotencyKey,
          expectedVersion,
          category,
          extendSeconds: operation === 'extend' ? extendSeconds || 300 : undefined,
        },
        session,
      );
    },
    onSuccess: (session, { operation }) => {
      queryClient.setQueryData(
        ['focus', 'active'],
        operation === 'complete' || operation === 'abandon' ? null : session,
      );
      if (operation === 'complete') setLastCompletedSession(session);
      if (operation === 'complete' || operation === 'abandon') audio.stop();
    },
  });

  const attachTask = useMutation({
    mutationFn: ({ taskId, session, idempotencyKey, expectedVersion }: {
      taskId: string | null;
      session: FocusSession;
      idempotencyKey: string;
      expectedVersion: number;
    }) => {
      return api.focusAction(
        session.id,
        'attach',
        {
          idempotencyKey,
          expectedVersion,
          taskId,
        },
        session,
      );
    },
    onSuccess: (session) => {
      setSelectedTask(session.taskId ?? '');
      setTaskPickerOpen(false);
      queryClient.setQueryData(['focus', 'active'], session);
    },
  });

  const renameTitle = useMutation({
    mutationFn: ({ customTitle, session, idempotencyKey, expectedVersion }: {
      customTitle: string;
      session: FocusSession;
      idempotencyKey: string;
      expectedVersion: number;
    }) => {
      return api.focusAction(
        session.id,
        'rename',
        {
          idempotencyKey,
          expectedVersion,
          customTitle,
        },
        session,
      );
    },
    onSuccess: (session) => {
      queryClient.setQueryData(['focus', 'active'], session);
    },
  });

  const commitTitle = () => {
    setIsEditingTitle(false);
    if (active.data) {
      renameTitle.mutate({
        customTitle: customTitle.trim(),
        session: active.data,
        idempotencyKey: eventKey(),
        expectedVersion: active.data.version,
      });
    }
  };

  const editRecordedFocus = useMutation({
    mutationFn: ({ idempotencyKey, expectedVersion }: { idempotencyKey: string; expectedVersion: number }) => {
      if (!editingSession) throw new Error('No focus record selected');
      return api.adjustFocus(
        editingSession.id,
        {
          startedAt: new Date(editStartedAt).toISOString(),
          completedAt: new Date(editCompletedAt).toISOString(),
          taskId: editTaskId || null,
          idempotencyKey,
          expectedVersion,
        },
        editingSession,
      );
    },
    onSuccess: (updatedSession) => {
      queryClient.setQueryData<FocusSession[]>(['focus', 'history'], (sessions) =>
        sessions?.map((session) => (session.id === updatedSession.id ? updatedSession : session)),
      );
      void queryClient.invalidateQueries({ queryKey: ['focus', 'summary'] });
      setEditingSession(null);
    },
  });

  const selectedTaskObj = (tasks.data?.data ?? []).find((t) => t.id === selectedTask);
  const attachedTaskId = active.data?.taskId ?? selectedTask;
  const availableTasks = useMemo(() => {
    const query = taskSearch.trim().toLocaleLowerCase();
    return (tasks.data?.data ?? []).filter(
      (task) =>
        !['COMPLETED', 'CANCELED', 'ARCHIVED'].includes(task.status) &&
        (!query || task.title.toLocaleLowerCase().includes(query)),
    );
  }, [taskSearch, tasks.data]);

  const selectTask = (taskId: string) => {
    if (active.data) {
      const session = active.data;
      attachTask.mutate({
        taskId: taskId || null,
        session,
        idempotencyKey: eventKey(),
        expectedVersion: session.version,
      });
      return;
    }
    setSelectedTask(taskId);
    setTaskPickerOpen(false);
    setTaskSearch('');
  };

  const runFocusAction = (operation: 'pause' | 'resume' | 'complete' | 'abandon' | 'extend', options: { category?: string; extendSeconds?: number } = {}) => {
    const session = active.data;
    if (!session) return;
    action.mutate({
      operation,
      ...options,
      session,
      idempotencyKey: eventKey(),
      expectedVersion: session.version,
    });
  };

  // Group history sessions by date
  const groupedHistory = useMemo(() => {
    const map = new Map<string, FocusSession[]>();
    for (const session of history.data ?? []) {
      const dateStr = new Date(session.adjustedStartedAt ?? session.startedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      map.set(dateStr, [...(map.get(dateStr) ?? []), session]);
    }
    return Array.from(map.entries());
  }, [history.data]);

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!recordSearch.trim()) return groupedHistory;
    const q = recordSearch.trim().toLocaleLowerCase();
    return groupedHistory.filter(([dateStr]) => dateStr.toLocaleLowerCase().includes(q));
  }, [groupedHistory, recordSearch]);

  const visibleGroups = filteredGroups.slice(0, visibleDayCount);

  const totalPomoCount = summary.data?.completedSessions ?? 0;
  const todayFocusSecs = summary.data?.focusedSeconds ?? 0;
  const completedFocusReceipt = lastCompletedSession
    ? growthReceipts.find(
        (receipt) => receipt.sourceType === 'FOCUS_PRESET' && receipt.sourceId === lastCompletedSession.id,
      )
    : undefined;

  // Percentage circle progress
  const plannedSecs = active.data?.plannedSeconds || MODE_SECONDS[timerMode];
  const isOvertime = displaySeconds < 0;
  const progressRatio = isOvertime ? 1 : Math.max(0, Math.min(1, 1 - displaySeconds / plannedSecs));
  const CIRC = 748; // circumference for r=119
  const strokeDashoffset = CIRC * (1 - progressRatio);

  // Active session total elapsed (for display in footer)
  const totalElapsedMinutes = active.data
    ? Math.max(
        1,
        Math.round(
          (Date.now() - new Date(active.data.startedAt).getTime()) / 60000 -
            (active.data.accumulatedPauseSecs || 0) / 60,
        ),
      )
    : 0;

  const applyInlineTime = () => {
    const m = parseInt(editMinutes, 10) || 0;
    const s = parseInt(editSeconds, 10) || 0;
    const totalSecs = Math.max(1, Math.min(180 * 60, m * 60 + s));
    setSelectedDurationSeconds(totalSecs);
    setIsEditingTime(false);
    if (timerMode === 'FOCUS') setTimerMode('FOCUS'); // re-trigger display
  };
  const currentTitle = active.data?.customTitle || active.data?.taskTitleSnapshot || customTitle || selectedTaskObj?.title || 'Focus';

  const startFocus = () => {
    setLastCompletedSession(null);
    const trimmedCustom = customTitle.trim();
    const optimistic = createOptimisticFocusSession({
      id: createUlid(),
      taskId: selectedTask || undefined,
      taskTitleSnapshot: selectedTaskObj?.title,
      customTitle: trimmedCustom || undefined,
      plannedSeconds: MODE_SECONDS[timerMode],
      startedAt: new Date().toISOString(),
    });
    start.mutate({ optimistic, idempotencyKey: eventKey() });
    void audio.startFromGesture();
    if (userSettings.notificationEnabled && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  const openRecordEditor = (session: FocusSession) => {
    setEditingSession(session);
    setEditStartedAt(toDateTimeLocalValue(session.adjustedStartedAt ?? session.startedAt));
    setEditCompletedAt(toDateTimeLocalValue(session.adjustedCompletedAt ?? session.completedAt ?? session.startedAt));
    setEditTaskId(session.taskId ?? '');
  };

  const handleModeSwitch = (mode: TimerMode) => {
    if (active.data) return; // don't switch mode while timer is running
    setTimerMode(mode);
  };

  const toggleDayCollapse = (dateStr: string) => {
    setCollapsedDays((prev) => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  /* ────────────────────── Render ────────────────────── */

  return (
    <div className="min-h-full space-y-5 pb-12">
      {/* ── Top Bar ── */}
      <PageHeader kicker="Timer & Sessions" title="Focus">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          title="Focus Settings"
          aria-label="Focus Settings"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PageHeader>

      {/* ── Main Grid ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        {/* ════════ LEFT COLUMN: Timer Card ════════ */}
        <Card className="p-5 sm:p-8">
          {/* ── Mode Switcher Tabs ── */}
          <div className="mx-auto mb-6 flex max-w-sm rounded-xl border border-border bg-muted p-1">
            {(['FOCUS', 'SHORT_BREAK', 'LONG_BREAK'] as const).map((mode) => {
              const activeMode = active.data ? (active.data.phase === 'WORK' ? 'FOCUS' : active.data.phase) : timerMode;
              const isSelected = activeMode === mode;
              const labels: Record<TimerMode, string> = {
                FOCUS: 'Focus',
                SHORT_BREAK: 'Short break',
                LONG_BREAK: 'Long break',
              };
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={Boolean(active.data)}
                  onClick={() => handleModeSwitch(mode)}
                  className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-all disabled:opacity-50 ${
                    isSelected
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>

          {/* ── Title & Task Selector ── */}
          <div className="relative flex items-center justify-center gap-2 mb-5 max-w-full">
            {isEditingTitle ? (
              <Input
                type="text"
                placeholder="Focus title..."
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    commitTitle();
                  }
                }}
                onBlur={() => commitTitle()}
                className="h-8 w-56 text-center text-sm font-semibold"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCustomTitle(currentTitle !== 'Focus' ? currentTitle : '');
                  setIsEditingTitle(true);
                }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary max-w-full"
                title="Click to edit focus title"
              >
                <span className="max-w-[220px] sm:max-w-xs truncate">{currentTitle}</span>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setTaskPickerOpen((open) => !open);
                setTaskSearch('');
              }}
              className="inline-flex items-center justify-center p-1.5 text-muted-foreground transition-colors hover:text-foreground rounded-lg hover:bg-accent"
              title="Assign task to session"
            >
              <ListTodo className="h-4 w-4" />
            </button>

            {taskPickerOpen && (
              <div className="absolute left-1/2 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border bg-popover p-2 shadow-[var(--itu-shadow-pop)]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search tasks..."
                    value={taskSearch}
                    onChange={(event) => setTaskSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setTaskPickerOpen(false);
                        setTaskSearch('');
                      }
                    }}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="mt-2 max-h-64 overflow-y-auto">
                  <button
                    type="button"
                    disabled={attachTask.isPending}
                    onClick={() => selectTask('')}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <span>No task</span>
                    {!attachedTaskId && <Check className="h-4 w-4 text-primary" />}
                  </button>
                  {availableTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      disabled={attachTask.isPending}
                      onClick={() => selectTask(task.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <span className="truncate">{task.title}</span>
                      {attachedTaskId === task.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  ))}
                  {!tasks.isLoading && availableTasks.length === 0 && (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">No matching tasks</p>
                  )}
                  {tasks.isLoading && (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">Loading tasks...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Timer Dial ── */}
          <div className="relative mx-auto mb-5 flex items-center justify-center w-full max-w-[280px] aspect-square">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 280 280">
              <defs>
                <linearGradient id="dialGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--itu-teal-500)" />
                  <stop offset="100%" stopColor="#52e8c4" />
                </linearGradient>
              </defs>
              <DialTicks cx={140} cy={140} r={128} />
              {/* Background track */}
              <circle cx="140" cy="140" r="119" fill="none" stroke="var(--itu-border)" strokeWidth="3" />
              {/* Progress ring */}
              <circle
                cx="140"
                cy="140"
                r="119"
                fill="none"
                stroke={isOvertime ? '#52e8c4' : 'url(#dialGradient)'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700"
              />
            </svg>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
              {isEditingTime && !active.data ? (
                <div
                  ref={timeEditContainerRef}
                  className="inline-flex items-center justify-center font-mono text-[42px] sm:text-[52px] font-semibold tracking-tight tabular-nums leading-none text-foreground"
                  onBlur={(e) => {
                    if (timeEditContainerRef.current && timeEditContainerRef.current.contains(e.relatedTarget as Node)) {
                      return;
                    }
                    applyInlineTime();
                  }}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={editMinutes}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setEditMinutes(val);
                      if (val.length >= 2) {
                        secondsInputRef.current?.focus();
                        secondsInputRef.current?.select();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyInlineTime();
                      } else if (e.key === 'Escape') {
                        setIsEditingTime(false);
                      } else if (e.key === 'ArrowRight' || e.key === ':') {
                        e.preventDefault();
                        secondsInputRef.current?.focus();
                        secondsInputRef.current?.select();
                      }
                    }}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    aria-label="Edit focus minutes"
                    className="w-[56px] sm:w-[72px] bg-transparent text-right border-none outline-none focus:outline-none focus:ring-0 p-0 text-foreground font-mono text-[42px] sm:text-[52px] font-semibold tabular-nums shadow-none"
                  />
                  <span className="select-none px-0.5">:</span>
                  <input
                    ref={secondsInputRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={editSeconds}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setEditSeconds(val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyInlineTime();
                      } else if (e.key === 'Escape') {
                        setIsEditingTime(false);
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    aria-label="Edit focus seconds"
                    className="w-[56px] sm:w-[72px] bg-transparent text-left border-none outline-none focus:outline-none focus:ring-0 p-0 text-foreground font-mono text-[42px] sm:text-[52px] font-semibold tabular-nums shadow-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(active.data)}
                  onClick={() => {
                    if (!active.data) {
                      const mins = Math.floor(displaySeconds / 60);
                      const secs = displaySeconds % 60;
                      setEditMinutes(String(mins).padStart(2, '0'));
                      setEditSeconds(String(secs).padStart(2, '0'));
                      setIsEditingTime(true);
                    }
                  }}
                  className={`font-mono text-[42px] sm:text-[52px] font-semibold tracking-tight tabular-nums leading-none transition-opacity ${
                    !active.data ? 'cursor-pointer hover:opacity-80' : ''
                  } ${isOvertime ? 'text-[#52e8c4] animate-pulse' : 'text-foreground'}`}
                  title={!active.data ? 'Click to change time length' : undefined}
                >
                  {formatFocusTime(displaySeconds)}
                </button>
              )}
              {active.data && (
                <span className="mt-2 text-xs font-semibold tracking-wider uppercase text-[var(--itu-teal-600)] flex items-center gap-1.5">
                  <span className="h-[5px] w-[5px] rounded-full bg-[var(--itu-teal-500)]" />
                  {isOvertime ? 'Overtime' : active.data.status === 'PAUSED' ? 'Paused' : 'Focusing...'}
                </span>
              )}
              {!active.data && (
                <span className="mt-2 text-xs font-semibold tracking-wider uppercase text-muted-foreground/70">
                  Ready
                </span>
              )}
              {completedFocusReceipt && lastCompletedSession && (
                <p role="status" className="mt-3 text-xs text-muted-foreground">
                  {validFocusMinutes(lastCompletedSession)} valid minutes · Account XP:{' '}
                  {completedFocusReceipt.accountAward?.amount ?? 0}
                </p>
              )}
            </div>
          </div>

          {/* ── Background Sound Ambient Player ── */}
          {isAudioCompact ? (
            <FocusAudioPill
              onClickSettings={() => setSettingsOpen(true)}
              onToggleExpand={() => toggleAudioCompact(false)}
            />
          ) : (
            <FocusAudioPlayerCard
              className="mx-auto my-5 w-full max-w-md"
              onClickHeader={() => setSettingsOpen(true)}
              onToggleCompact={() => toggleAudioCompact(true)}
            />
          )}

          {/* ── Action Buttons ── */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 w-full">
            {active.data ? (
              <>
                {active.data.status === 'PAUSED' ? (
                  <Button
                    size="lg"
                    className="rounded-full h-10 sm:h-12 px-3.5 sm:px-6 text-xs sm:text-sm font-semibold shrink-0"
                    onClick={() => {
                      runFocusAction('resume');
                      void audio.resume();
                    }}
                    title="Resume"
                    aria-label="Resume focus session"
                  >
                    <Play className="mr-1.5 h-3.5 sm:h-4 w-3.5 sm:w-4 fill-current shrink-0" />
                    Resume
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full h-10 sm:h-12 px-3.5 sm:px-5 border-border text-xs sm:text-sm font-semibold shrink-0"
                    onClick={() => {
                      runFocusAction('pause', { category: 'INTENTIONAL_BREAK' });
                      audio.pause();
                    }}
                    title="Pause"
                    aria-label="Pause focus session"
                  >
                    <Pause className="mr-1.5 h-3.5 sm:h-4 w-3.5 sm:w-4 shrink-0" />
                    Pause
                  </Button>
                )}

                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full h-10 sm:h-12 px-3 sm:px-4 border-border text-xs font-semibold shrink-0"
                  onClick={() => runFocusAction('extend', { extendSeconds: 300 })}
                  title="Add 5 minutes to timer"
                  aria-label="Add 5 minutes to timer"
                >
                  <TimerReset className="mr-1 h-3.5 sm:h-4 w-3.5 sm:w-4 shrink-0" />
                  +5m
                </Button>

                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full h-10 sm:h-12 px-3.5 sm:px-6 text-xs sm:text-sm font-semibold shrink-0"
                  onClick={() => runFocusAction('complete')}
                  title="Stop session"
                  aria-label="Stop focus session"
                >
                  <Square className="mr-1.5 h-3.5 sm:h-4 w-3.5 sm:w-4 fill-current shrink-0" />
                  Stop
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => runFocusAction('abandon')}
                  title="Abandon session"
                  aria-label="Abandon focus session"
                >
                  <RotateCcw className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                className="h-11 sm:h-12 rounded-full px-8 sm:px-14 text-sm sm:text-base itu-primary-action min-w-[120px]"
                onClick={() => void startFocus()}
                disabled={start.isPending}
              >
                <Play className="mr-2 h-4 w-4 fill-current" />
                {start.isPending ? 'Starting...' : 'Start'}
              </Button>
            )}
          </div>

          {/* ── Timer footer ── */}
          {active.data && (
            <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4 text-[11px] font-mono text-muted-foreground/70">
              <span>Session {totalElapsedMinutes}m elapsed</span>
              <span>{formatFocusTime(MODE_SECONDS[timerMode])} planned</span>
            </div>
          )}
        </Card>

        {/* ════════ RIGHT COLUMN: Stats + Records ════════ */}
        <div className="space-y-5">
          {/* ── Stats Grid ── */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Today's pomo" value={String(summary.data?.completedSessions ?? 0)} />
            <StatCard label="Today's focus" value={formatMinutes(todayFocusSecs)} />
            <StatCard label="Total pomo" value={String(totalPomoCount)} />
            <StatCard label="Total focus" value={formatHoursMinutes(todayFocusSecs)} />
          </div>

          {/* ── Focus Records ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">Focus record</h3>
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                  <Search className="h-3 w-3" />
                  <input
                    type="text"
                    placeholder="Search dates..."
                    value={recordSearch}
                    onChange={(e) => setRecordSearch(e.target.value)}
                    className="w-20 bg-transparent outline-none placeholder:text-muted-foreground/50 text-xs"
                  />
                </div>
                {/* Merge toggle */}
                <button
                  type="button"
                  onClick={() => setMergeShort((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    mergeShort
                      ? 'border-[var(--itu-teal-500)]/30 bg-[var(--itu-mint-50)] text-[var(--itu-teal-700)]'
                      : 'border-border/70 bg-muted/30 text-muted-foreground'
                  }`}
                >
                  <span
                    className={`h-3.5 w-[22px] rounded-full transition-colors ${
                      mergeShort ? 'bg-[var(--itu-teal-500)]' : 'bg-border'
                    } relative`}
                  >
                    <span
                      className={`absolute top-0.5 block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform ${
                        mergeShort ? 'translate-x-[10px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </span>
                  Combine
                </button>
              </div>
            </div>

            {filteredGroups.length > 0 ? (
              <div className="space-y-0">
                {visibleGroups.map(([dateStr, sessions], gi) => {
                  const isToday = gi === 0;
                  const collapsed = collapsedDays[dateStr] ?? false;
                  const totalMins = sessions.reduce((acc, s) => {
                    const start = new Date(s.adjustedStartedAt ?? s.startedAt);
                    const end = new Date(s.adjustedCompletedAt ?? s.completedAt ?? Date.now());
                    return (
                      acc +
                      Math.max(
                        1,
                        Math.round((end.getTime() - start.getTime()) / 60000) -
                          Math.round((s.accumulatedPauseSecs || 0) / 60),
                      )
                    );
                  }, 0);

                  // Density bars
                  const maxDur = Math.max(
                    1,
                    ...sessions.map((s) => {
                      const start = new Date(s.adjustedStartedAt ?? s.startedAt);
                      const end = new Date(s.adjustedCompletedAt ?? s.completedAt ?? Date.now());
                      return Math.max(
                        1,
                        Math.round((end.getTime() - start.getTime()) / 60000) -
                          Math.round((s.accumulatedPauseSecs || 0) / 60),
                      );
                    }),
                  );
                  const densityBars = sessions.slice(0, 12).map((s) => {
                    const start = new Date(s.adjustedStartedAt ?? s.startedAt);
                    const end = new Date(s.adjustedCompletedAt ?? s.completedAt ?? Date.now());
                    const mins = Math.max(
                      1,
                      Math.round((end.getTime() - start.getTime()) / 60000) -
                        Math.round((s.accumulatedPauseSecs || 0) / 60),
                    );
                    const h = Math.max(3, Math.round((mins / maxDur) * 14));
                    return (
                      <span
                        key={s.id}
                        className="w-[3px] rounded-[1px] bg-[var(--itu-teal-400)]"
                        style={{ height: `${h}px` }}
                      />
                    );
                  });

                  return (
                    <div key={dateStr} className="border-t border-border/50 first:border-t-0">
                      {/* Day header */}
                      <button
                        type="button"
                        onClick={() => toggleDayCollapse(dateStr)}
                        className="flex w-full items-center gap-2 py-3 text-left"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform ${
                            collapsed ? '-rotate-90' : ''
                          }`}
                        />
                        <span className="text-xs font-semibold text-foreground">
                          {dateStr}
                          {isToday && (
                            <span className="ml-2 rounded bg-[var(--itu-mint-100)] px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[var(--itu-teal-700)]">
                              Today
                            </span>
                          )}
                        </span>
                        <span className="ml-auto flex items-center gap-3 text-[11px] font-mono text-muted-foreground/70">
                          <span className="flex items-end gap-[2px] h-3.5">{densityBars}</span>
                          <span>
                            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
                          </span>
                          <span>{totalMins}m</span>
                        </span>
                      </button>

                      {/* Day body */}
                      {!collapsed && (
                        <div className="space-y-0.5 pb-2 pl-5">
                          {buildSessionRows(sessions, mergeShort, openRecordEditor)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Load more */}
                {visibleDayCount < filteredGroups.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleDayCount((c) => Math.min(c + 5, filteredGroups.length))}
                    className="mt-3 w-full rounded-lg border border-dashed border-border py-2.5 text-xs font-semibold text-muted-foreground hover:border-[var(--itu-teal-500)] hover:text-[var(--itu-teal-700)] transition-colors"
                  >
                    Show {Math.min(5, filteredGroups.length - visibleDayCount)} earlier day
                    {filteredGroups.length - visibleDayCount > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                {recordSearch.trim()
                  ? 'No matching dates found.'
                  : 'No focus records yet. Complete a session to start tracking.'}
              </div>
            )}
          </Card>
        </div>
      </div>


      {/* ── Edit Record Dialog ── */}
      <Dialog
        open={Boolean(editingSession)}
        onOpenChange={(open) => {
          if (!open) setEditingSession(null);
        }}
      >
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Edit Focus Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Start</label>
              <Input
                type="datetime-local"
                value={editStartedAt}
                onChange={(event) => setEditStartedAt(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">End</label>
              <Input
                type="datetime-local"
                value={editCompletedAt}
                onChange={(event) => setEditCompletedAt(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Task</label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={editTaskId}
                onChange={(event) => setEditTaskId(event.target.value)}
              >
                <option value="">No task</option>
                {(tasks.data?.data ?? [])
                  .filter((task) => !['CANCELED', 'ARCHIVED'].includes(task.status))
                  .map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
              </select>
            </div>
            {isTimeRangeInvalid && (
              <p className="text-xs text-destructive">End time must be after start time.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingSession(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editingSession) return;
                editRecordedFocus.mutate({ idempotencyKey: eventKey(), expectedVersion: editingSession.version });
              }}
              disabled={editRecordedFocus.isPending || isTimeRangeInvalid}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Focus Settings Modal ── */}
      <FocusSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSettingsChange={(settings) => {
          setUserSettings(settings);
          if (!active.data) {
            setSelectedDurationSeconds(settings.defaultWorkMinutes * 60);
            setEditMinutes(String(settings.defaultWorkMinutes));
            setEditSeconds('00');
          }
        }}
      />
    </div>
  );
}

/* ──────────────────── Sub-components ──────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 space-y-1.5">
      <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
    </Card>
  );
}

function sessionDurationMinutes(session: FocusSession): number {
  const start = new Date(session.adjustedStartedAt ?? session.startedAt);
  const end = new Date(session.adjustedCompletedAt ?? session.completedAt ?? Date.now());
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 60000) - Math.round((session.accumulatedPauseSecs || 0) / 60),
  );
}

function buildSessionRows(sessions: FocusSession[], mergeShort: boolean, openEditor: (s: FocusSession) => void) {
  if (!mergeShort) {
    return sessions.map((s) => {
      const start = new Date(s.adjustedStartedAt ?? s.startedAt);
      const end = new Date(s.adjustedCompletedAt ?? s.completedAt ?? Date.now());
      return (
        <SessionRow
          key={s.id}
          time={`${formatTimeString(start)} – ${formatTimeString(end)}`}
          dur={`${sessionDurationMinutes(s)}m`}
          note=""
          onEdit={() => openEditor(s)}
        />
      );
    });
  }

  // Merge sessions under 2 minutes
  const long = sessions.filter((s) => sessionDurationMinutes(s) >= 2);
  const short = sessions.filter((s) => sessionDurationMinutes(s) < 2);

  const rows: React.ReactNode[] = [];
  for (const s of long) {
    const start = new Date(s.adjustedStartedAt ?? s.startedAt);
    const end = new Date(s.adjustedCompletedAt ?? s.completedAt ?? Date.now());
    rows.push(
      <SessionRow
        key={s.id}
        time={`${formatTimeString(start)} – ${formatTimeString(end)}`}
        dur={`${sessionDurationMinutes(s)}m`}
        note={s.customTitle ?? s.taskTitleSnapshot ?? ''}
        onEdit={() => openEditor(s)}
      />,
    );
  }
  if (short.length > 0) {
    const totalShort = short.reduce((acc, s) => acc + sessionDurationMinutes(s), 0);
    rows.push(
      <div
        key="merged-short"
        className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs text-muted-foreground/70"
      >
        <span className="h-2 w-2 rounded-full bg-border shrink-0" />
        <span className="font-mono">{short.length} short sessions</span>
        <span className="flex-1 text-[11px]">under 2m each</span>
        <span className="font-mono">{totalShort}m total</span>
      </div>,
    );
  }
  return rows;
}

function SessionRow({ time, dur, note, onEdit }: { time: string; dur: string; note: string; onEdit: () => void }) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-muted/50">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--itu-teal-500)] ring-[3px] ring-[var(--itu-mint-100)]" />
      <span className="font-mono text-muted-foreground min-w-[116px]">{time}</span>
      {note && <span className="flex-1 truncate text-muted-foreground/70">{note}</span>}
      <span className="font-mono text-muted-foreground/70">{dur}</span>
      <button
        type="button"
        onClick={onEdit}
        className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
        title="Edit session"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ──────────────────── Helpers ──────────────────── */

function formatMinutes(seconds: number) {
  return `${Math.round(seconds / 60)}m`;
}

function formatHoursMinutes(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatTimeString(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

/**
 * Determine the human-readable label for the current focus sound state.
 * Priority order: disabled → muted → playing → downloading → downloaded/cached → needs download → paused.
 */
function getSoundStatusLabel(
  enabled: boolean,
  muted: boolean,
  isPlaying: boolean,
  isDownloading: boolean,
  isCachedOrJustDownloaded: boolean,
  needsDownload: boolean,
): string {
  if (!enabled) return 'Sound off';
  if (muted) return 'Muted';
  if (isPlaying) return 'Playing';
  if (isDownloading) return 'Downloading';
  if (isCachedOrJustDownloaded) return '';
  if (needsDownload) return 'Not loaded';
  return 'Paused';
}
