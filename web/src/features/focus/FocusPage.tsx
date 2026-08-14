import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/shared/api/client';
import type { FocusSession } from '@/shared/api/types';
import { createUlid } from '@/shared/sync/syncIdentity';
import { useGrowthSync } from '@/features/growth';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/PageHeader';
import {
  createOptimisticFocusSession,
  focusDisplaySeconds,
  focusElapsedSeconds,
  validFocusMinutes,
} from './utils/focusTimer';
import { playFinishChime } from '@/shared/utils/sound';
import { FocusSettingsModal, getStoredFocusSettings, type FocusUserSettings } from './components/FocusSettingsModal';
import { FocusRecordEditorDialog } from './components/FocusRecordEditorDialog';
import { FocusSettingsPopover } from './FocusSettingsPopover';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import type { FocusPreferences } from '@/shared/api/preferencesApi';
import { FocusRecordsCard } from './components/FocusRecordsCard';
import { FocusTimerCard, type FocusTimerMode } from './components/FocusTimerCard';

/* ───────────────────────────────────────────
   Direction contract (Focus surface redesign)
   THESIS: The timer dial is the gravitational center; the surface refuses crowded panels in favor of a spacious, meditative single-task experience.
   OWN-WORLD: Teal tokens (--itu-teal-*), Manrope display, IBM Plex Mono for timer/meta, shadcn Card + Button, --itu-shadow-card, ambient page gradient.
   STORY: Set duration → pick task → start → deep work. Sound chip confirms ambient mix. Stats + records sit quietly in the right column.
   FIRST VIEWPORT: Two-column grid; left = timer card with mode tabs, SVG dial (280px, 60 ticks, gradient ring), task/sound chips, action buttons. Right = 4-stat grid + collapsible day-grouped records with search & merge toggle.
   FORM: Extended existing surface inside the app's established teal/mint visual world.
   ─────────────────────────────────────────── */

function eventKey() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

/* ───────────────────────────────────────────
   Focus page component
   ─────────────────────────────────────────── */
export function FocusPage() {
  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateFocusPref = useMutation({
    mutationFn: (patch: Partial<FocusPreferences>) => api.updateFocusPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const { growthReceipts } = useGrowthSync();
  const [search] = useSearchParams();
  const [selectedTask, setSelectedTask] = useState(search.get('task') ?? '');
  const [customTitle, setCustomTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [editingSession, setEditingSession] = useState<FocusSession | null>(null);
  const [lastCompletedSession, setLastCompletedSession] = useState<FocusSession | null>(null);
  const [editStartedAt, setEditStartedAt] = useState('');
  const [editCompletedAt, setEditCompletedAt] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [userSettings, setUserSettings] = useState<FocusUserSettings>(getStoredFocusSettings);
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState(
    () => getStoredFocusSettings().defaultWorkMinutes * 60,
  );
  const [, tick] = useState(0);

  /* Mode tabs: Focus | Short Break | Long Break */
  const [timerMode, setTimerMode] = useState<FocusTimerMode>('FOCUS');

  const MODE_SECONDS: Record<FocusTimerMode, number> = {
    FOCUS: selectedDurationSeconds,
    SHORT_BREAK: 5 * 60,
    LONG_BREAK: 15 * 60,
  };

  const notificationFiredRef = useRef<Record<string, boolean>>({});

  const active = useQuery({ queryKey: ['focus', 'active'], queryFn: () => api.activeFocus() });
  const tasks = useQuery({ queryKey: ['tasks', 'all'], queryFn: () => api.tasks({ view: 'all' }) });
  const history = useQuery({ queryKey: ['focus', 'history'], queryFn: () => api.focusHistory() });
  const summary = useQuery({ queryKey: ['focus', 'summary'], queryFn: () => api.focusSummary() });

  useEffect(() => {
    const stored = getStoredFocusSettings();
    setUserSettings(stored);
    setSelectedDurationSeconds(stored.defaultWorkMinutes * 60);
  }, []);

  // 1-second timer tick
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const displaySeconds = active.data
    ? focusDisplaySeconds(active.data, userSettings.countExceededFocusTime ?? userSettings.autoContinueOvertime)
    : MODE_SECONDS[timerMode];
  const isCompletable = active.data ? focusElapsedSeconds(active.data) >= (active.data.plannedSeconds ?? 0) : false;
  // Check finish notification / chime / auto-completion
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

      // Auto completion logic:
      // If WORK session and countExceededFocusTime is false, auto-complete at 00:00 (audio continues!)
      // If SHORT_BREAK or LONG_BREAK session, breaks always auto-complete at 00:00 (audio continues!)
      const isWork = active.data.phase === 'WORK';
      const shouldAutoComplete = isWork
        ? !(userSettings.countExceededFocusTime ?? userSettings.autoContinueOvertime)
        : true;
      if (shouldAutoComplete) {
        action.mutate({
          operation: 'complete',
          session: active.data,
          idempotencyKey: eventKey(),
          expectedVersion: active.data.version,
        });
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
      // Audio continues per locked requirement; audio stops only when user manually stops/pauses audio
    },
  });

  const attachTask = useMutation({
    mutationFn: ({
      taskId,
      session,
      idempotencyKey,
      expectedVersion,
    }: {
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
    mutationFn: ({
      customTitle,
      session,
      idempotencyKey,
      expectedVersion,
    }: {
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

  const runFocusAction = (
    operation: 'pause' | 'resume' | 'complete' | 'abandon' | 'extend',
    options: { category?: string; extendSeconds?: number } = {},
  ) => {
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

  let progressRatio = 0;
  if (active.data) {
    const startMs = new Date(active.data.startedAt).getTime();
    const pauseSecs = active.data.accumulatedPauseSecs || 0;
    const endMs = active.data.pausedAt ? new Date(active.data.pausedAt).getTime() : Date.now();
    const elapsedSecs = Math.max(0, (endMs - startMs) / 1000 - pauseSecs);
    progressRatio = isOvertime || displaySeconds <= 0 ? 1 : Math.max(0, Math.min(1, elapsedSecs / plannedSecs));
  } else if (lastCompletedSession) {
    progressRatio = 1;
  }

  const CIRC = 747.7; // 2 * pi * 119
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

  const currentTitle =
    active.data?.customTitle || active.data?.taskTitleSnapshot || customTitle || selectedTaskObj?.title || 'Focus';

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

  const handleModeSwitch = (mode: FocusTimerMode) => {
    if (active.data) return; // don't switch mode while timer is running
    setTimerMode(mode);
  };

  /* ────────────────────── Render ────────────────────── */

  return (
    <div className="min-h-full space-y-5 pb-12">
      {/* ── Top Bar ── */}
      <PageHeader kicker="Timer & Sessions" title="Focus">
        <FeatureSettingsButton title="Focus settings">
          <FocusSettingsPopover
            preferences={userPreferences.data?.focus}
            onChange={(patch) => updateFocusPref.mutate(patch)}
          />
        </FeatureSettingsButton>
      </PageHeader>

      {/* ── Main Grid ── */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <FocusTimerCard
          active={active.data}
          timerMode={timerMode}
          modeSeconds={MODE_SECONDS}
          onModeSwitch={handleModeSwitch}
          currentTitle={currentTitle}
          isEditingTitle={isEditingTitle}
          customTitle={customTitle}
          onCustomTitleChange={setCustomTitle}
          onBeginTitleEdit={() => {
            setCustomTitle(currentTitle !== 'Focus' ? currentTitle : '');
            setIsEditingTitle(true);
          }}
          onCommitTitle={commitTitle}
          taskPickerOpen={taskPickerOpen}
          taskSearch={taskSearch}
          availableTasks={availableTasks}
          tasksLoading={tasks.isLoading}
          attachedTaskId={attachedTaskId}
          attachPending={attachTask.isPending}
          onToggleTaskPicker={() => {
            setTaskPickerOpen((open) => !open);
            setTaskSearch('');
          }}
          onTaskSearchChange={setTaskSearch}
          onCloseTaskPicker={() => {
            setTaskPickerOpen(false);
            setTaskSearch('');
          }}
          onSelectTask={selectTask}
          displaySeconds={displaySeconds}
          onDurationChange={(seconds) => setSelectedDurationSeconds(seconds)}
          isCompletable={isCompletable}
          isOvertime={isOvertime}
          strokeDashoffset={strokeDashoffset}
          completedFocusMinutes={
            completedFocusReceipt && lastCompletedSession ? validFocusMinutes(lastCompletedSession) : null
          }
          completedReceiptXp={
            completedFocusReceipt && lastCompletedSession ? completedFocusReceipt.accountAward?.amount ?? 0 : null
          }
          totalElapsedMinutes={totalElapsedMinutes}
          startPending={start.isPending}
          onStart={startFocus}
          onRunAction={runFocusAction}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Today's pomo" value={String(summary.data?.completedSessions ?? 0)} />
            <StatCard label="Today's focus" value={formatMinutes(todayFocusSecs)} />
            <StatCard label="Total pomo" value={String(totalPomoCount)} />
            <StatCard label="Total focus" value={formatHoursMinutes(todayFocusSecs)} />
          </div>
          <FocusRecordsCard sessions={history.data ?? []} onEdit={openRecordEditor} />
        </div>
      </div>

      <FocusRecordEditorDialog
        session={editingSession}
        tasks={tasks.data?.data ?? []}
        startedAt={editStartedAt}
        completedAt={editCompletedAt}
        taskId={editTaskId}
        isPending={editRecordedFocus.isPending}
        onOpenChange={(open) => {
          if (!open) setEditingSession(null);
        }}
        onStartedAtChange={setEditStartedAt}
        onCompletedAtChange={setEditCompletedAt}
        onTaskChange={setEditTaskId}
        onCancel={() => setEditingSession(null)}
        onSave={() => {
          if (!editingSession) return;
          editRecordedFocus.mutate({ idempotencyKey: eventKey(), expectedVersion: editingSession.version });
        }}
      />

      {/* ── Focus Settings Modal ── */}
      <FocusSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSettingsChange={(settings) => {
          setUserSettings(settings);
          if (!active.data) {
            setSelectedDurationSeconds(settings.defaultWorkMinutes * 60);
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

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}
