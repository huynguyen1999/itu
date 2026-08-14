import { useRef, useState, type ReactNode } from 'react';
import { Check, ListTodo, Pause, Pencil, Play, RotateCcw, Search, TimerReset } from 'lucide-react';
import type { FocusSession } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { formatFocusTime } from '../utils/focusTimer';
import { useFocusAudio } from './FocusAudioProvider';
import { FocusAudioPill, FocusAudioPlayerCard } from './FocusAudioPlayer';

export type FocusTimerMode = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';
type FocusAction = 'pause' | 'resume' | 'complete' | 'abandon' | 'extend';
type FocusActionOptions = { category?: string; extendSeconds?: number };

type FocusTimerCardProps = {
  active: FocusSession | null | undefined;
  timerMode: FocusTimerMode;
  modeSeconds: Record<FocusTimerMode, number>;
  onModeSwitch: (mode: FocusTimerMode) => void;
  currentTitle: string;
  isEditingTitle: boolean;
  customTitle: string;
  onCustomTitleChange: (value: string) => void;
  onBeginTitleEdit: () => void;
  onCommitTitle: () => void;
  taskPickerOpen: boolean;
  taskSearch: string;
  availableTasks: Array<{ id: string; title: string }>;
  tasksLoading: boolean;
  attachedTaskId: string;
  attachPending: boolean;
  onToggleTaskPicker: () => void;
  onTaskSearchChange: (value: string) => void;
  onCloseTaskPicker: () => void;
  onSelectTask: (taskId: string) => void;
  displaySeconds: number;
  onDurationChange: (seconds: number) => void;
  isCompletable: boolean;
  isOvertime: boolean;
  strokeDashoffset: number;
  completedFocusMinutes: number | null;
  completedReceiptXp: number | null;
  totalElapsedMinutes: number;
  startPending: boolean;
  onStart: () => void;
  onRunAction: (operation: FocusAction, options?: FocusActionOptions) => void;
  onOpenSettings: () => void;
};

export function FocusTimerCard({
  active,
  timerMode,
  modeSeconds,
  onModeSwitch,
  currentTitle,
  isEditingTitle,
  customTitle,
  onCustomTitleChange,
  onBeginTitleEdit,
  onCommitTitle,
  taskPickerOpen,
  taskSearch,
  availableTasks,
  tasksLoading,
  attachedTaskId,
  attachPending,
  onToggleTaskPicker,
  onTaskSearchChange,
  onCloseTaskPicker,
  onSelectTask,
  displaySeconds,
  onDurationChange,
  isCompletable,
  isOvertime,
  strokeDashoffset,
  completedFocusMinutes,
  completedReceiptXp,
  totalElapsedMinutes,
  startPending,
  onStart,
  onRunAction,
  onOpenSettings,
}: FocusTimerCardProps) {
  const audio = useFocusAudio();
  const [isAudioCompact, setIsAudioCompact] = useState(() => {
    try {
      return localStorage.getItem('itu.focus.audio-compact') === 'true';
    } catch {
      return false;
    }
  });
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editMinutes, setEditMinutes] = useState('25');
  const [editSeconds, setEditSeconds] = useState('00');
  const timeEditContainerRef = useRef<HTMLDivElement>(null);
  const secondsInputRef = useRef<HTMLInputElement>(null);

  const toggleAudioCompact = (compact: boolean) => {
    setIsAudioCompact(compact);
    try {
      localStorage.setItem('itu.focus.audio-compact', String(compact));
    } catch {
      // Storage optional
    }
  };

  const applyInlineTime = () => {
    const minutes = parseInt(editMinutes, 10) || 0;
    const seconds = parseInt(editSeconds, 10) || 0;
    const totalSeconds = Math.max(1, Math.min(180 * 60, minutes * 60 + seconds));
    onModeSwitch('FOCUS');
    setIsEditingTime(false);
    onDurationChange(totalSeconds);
  };

  return (
    <Card className="p-5 sm:p-8">
      <div className="mx-auto mb-6 flex max-w-sm rounded-xl border border-border bg-muted p-1">
        {(['FOCUS', 'SHORT_BREAK', 'LONG_BREAK'] as const).map((mode) => {
          const activeMode = active ? (active.phase === 'WORK' ? 'FOCUS' : active.phase) : timerMode;
          const isSelected = activeMode === mode;
          const labels: Record<FocusTimerMode, string> = {
            FOCUS: 'Focus',
            SHORT_BREAK: 'Short break',
            LONG_BREAK: 'Long break',
          };
          return (
            <button
              key={mode}
              type="button"
              disabled={Boolean(active)}
              onClick={() => onModeSwitch(mode)}
              className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-all disabled:opacity-50 ${
                isSelected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {labels[mode]}
            </button>
          );
        })}
      </div>

      <div className="relative mb-5 flex max-w-full items-center justify-center gap-2">
        {isEditingTitle ? (
          <Input
            type="text"
            placeholder="Focus title..."
            value={customTitle}
            onChange={(event) => onCustomTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') onCommitTitle();
            }}
            onBlur={onCommitTitle}
            className="h-8 w-56 text-center text-sm font-semibold"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={onBeginTitleEdit}
            className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            title="Click to edit focus title"
          >
            <span className="max-w-[220px] truncate sm:max-w-xs">{currentTitle}</span>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTaskPicker}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                onChange={(event) => onTaskSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onCloseTaskPicker();
                }}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <button
                type="button"
                disabled={attachPending}
                onClick={() => onSelectTask('')}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                <span>No task</span>
                {!attachedTaskId && <Check className="h-4 w-4 text-primary" />}
              </button>
              {availableTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  disabled={attachPending}
                  onClick={() => onSelectTask(task.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <span className="truncate">{task.title}</span>
                  {attachedTaskId === task.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
              {!tasksLoading && availableTasks.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">No matching tasks</p>
              )}
              {tasksLoading && <p className="px-3 py-4 text-center text-sm text-muted-foreground">Loading tasks...</p>}
            </div>
          </div>
        )}
      </div>

      <div className="relative mx-auto mb-5 flex aspect-square w-full max-w-[280px] items-center justify-center">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 280 280">
          <defs>
            <linearGradient id="dialGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--itu-teal-500)" />
              <stop offset="100%" stopColor="#52e8c4" />
            </linearGradient>
          </defs>
          <DialTicks cx={140} cy={140} r={128} />
          <circle cx="140" cy="140" r="119" fill="none" stroke="var(--itu-border)" strokeWidth="3" />
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

        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
          {isEditingTime && !active ? (
            <div
              ref={timeEditContainerRef}
              className="inline-flex items-center justify-center font-mono text-[42px] font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-[52px]"
              onBlur={(event) => {
                if (timeEditContainerRef.current?.contains(event.relatedTarget as Node)) return;
                applyInlineTime();
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={editMinutes}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, '').slice(0, 3);
                  setEditMinutes(value);
                  if (value.length >= 2) {
                    secondsInputRef.current?.focus();
                    secondsInputRef.current?.select();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyInlineTime();
                  else if (event.key === 'Escape') setIsEditingTime(false);
                  else if (event.key === 'ArrowRight' || event.key === ':') {
                    event.preventDefault();
                    secondsInputRef.current?.focus();
                    secondsInputRef.current?.select();
                  }
                }}
                autoFocus
                onFocus={(event) => event.target.select()}
                aria-label="Edit focus minutes"
                className="w-[56px] bg-transparent p-0 text-right font-mono text-[42px] font-semibold tabular-nums text-foreground shadow-none outline-none focus:outline-none focus:ring-0 sm:w-[72px] sm:text-[52px]"
              />
              <span className="select-none px-0.5">:</span>
              <input
                ref={secondsInputRef}
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={editSeconds}
                onChange={(event) => setEditSeconds(event.target.value.replace(/\D/g, '').slice(0, 2))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyInlineTime();
                  else if (event.key === 'Escape') setIsEditingTime(false);
                }}
                onFocus={(event) => event.target.select()}
                aria-label="Edit focus seconds"
                className="w-[56px] bg-transparent p-0 text-left font-mono text-[42px] font-semibold tabular-nums text-foreground shadow-none outline-none focus:outline-none focus:ring-0 sm:w-[72px] sm:text-[52px]"
              />
            </div>
          ) : (
            <button
              type="button"
              disabled={Boolean(active)}
              onClick={() => {
                if (!active) {
                  const minutes = Math.floor(displaySeconds / 60);
                  const seconds = displaySeconds % 60;
                  setEditMinutes(String(minutes).padStart(2, '0'));
                  setEditSeconds(String(seconds).padStart(2, '0'));
                  setIsEditingTime(true);
                }
              }}
              className={`font-mono text-[42px] font-semibold leading-none tracking-tight tabular-nums transition-opacity sm:text-[52px] ${
                !active ? 'cursor-pointer hover:opacity-80' : ''
              } ${isOvertime ? 'animate-pulse text-[#52e8c4]' : 'text-foreground'}`}
              title={!active ? 'Click to change time length' : undefined}
            >
              {formatFocusTime(displaySeconds)}
            </button>
          )}
          {active && (
            <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--itu-teal-600)]">
              <span className="h-[5px] w-[5px] rounded-full bg-[var(--itu-teal-500)]" />
              {isOvertime ? 'Overtime' : active.status === 'PAUSED' ? 'Paused' : 'Focusing...'}
            </span>
          )}
          {!active && <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Ready</span>}
          {completedFocusMinutes !== null && completedReceiptXp !== null && (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              {completedFocusMinutes} valid minutes · Account XP: {completedReceiptXp}
            </p>
          )}
        </div>
      </div>

      {isAudioCompact ? (
        <FocusAudioPill onClickSettings={onOpenSettings} onToggleExpand={() => toggleAudioCompact(false)} />
      ) : (
        <FocusAudioPlayerCard
          className="mx-auto my-5 w-full max-w-md"
          onClickHeader={onOpenSettings}
          onToggleCompact={() => toggleAudioCompact(true)}
        />
      )}

      <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:gap-3">
        {active ? (
          <>
            {active.status === 'PAUSED' ? (
              <Button
                size="lg"
                className="h-10 shrink-0 rounded-full px-3.5 text-xs font-semibold sm:h-12 sm:px-6 sm:text-sm"
                onClick={() => {
                  onRunAction('resume');
                  void audio.resume();
                }}
                title="Resume"
                aria-label="Resume focus session"
              >
                <Play className="mr-1.5 h-3.5 w-3.5 shrink-0 fill-current sm:h-4 sm:w-4" />
                Resume
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                className="h-10 shrink-0 rounded-full border-border px-3.5 text-xs font-semibold sm:h-12 sm:px-5 sm:text-sm"
                onClick={() => {
                  onRunAction('pause', { category: 'INTENTIONAL_BREAK' });
                  audio.pause();
                }}
                title="Pause"
                aria-label="Pause focus session"
              >
                <Pause className="mr-1.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                Pause
              </Button>
            )}

            <Button
              size="lg"
              variant="outline"
              className="h-10 shrink-0 rounded-full border-border px-3 text-xs font-semibold sm:h-12 sm:px-4"
              onClick={() => onRunAction('extend', { extendSeconds: 300 })}
              title="Add 5 minutes to timer"
              aria-label="Add 5 minutes to timer"
            >
              <TimerReset className="mr-1 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              +5m
            </Button>

            {isCompletable && (
              <Button
                size="lg"
                className="itu-primary-action h-10 shrink-0 rounded-full px-3.5 text-xs font-semibold sm:h-12 sm:px-6 sm:text-sm"
                onClick={() => onRunAction('complete')}
                title={active.phase === 'WORK' ? 'Complete session' : 'End Break'}
                aria-label={active.phase === 'WORK' ? 'Complete focus session' : 'End break'}
              >
                <Check className="mr-1.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                {active.phase === 'WORK' ? 'Complete' : 'End Break'}
              </Button>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground sm:h-12 sm:w-12"
              onClick={() => onRunAction('abandon')}
              title="Abandon session"
              aria-label="Abandon focus session"
            >
              <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </>
        ) : (
          <Button
            size="lg"
            className="itu-primary-action h-11 min-w-[120px] rounded-full px-8 text-sm sm:h-12 sm:px-14 sm:text-base"
            onClick={() => {
              onStart();
              void audio.startFromGesture();
            }}
            disabled={startPending}
          >
            <Play className="mr-2 h-4 w-4 fill-current" />
            {startPending ? 'Starting...' : 'Start'}
          </Button>
        )}
      </div>

      {active && (
        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4 font-mono text-[11px] text-muted-foreground/70">
          <span>Session {totalElapsedMinutes}m elapsed</span>
          <span>{formatFocusTime(modeSeconds[timerMode])} planned</span>
        </div>
      )}
    </Card>
  );
}

const CIRC = 747.7;

function DialTicks({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const ticks: ReactNode[] = [];
  const rInnerMajor = r * 0.84;
  const rInnerMinor = r * 0.9;
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
    const major = i % 5 === 0;
    const rIn = major ? rInnerMajor : rInnerMinor;
    ticks.push(
      <line
        key={i}
        x1={cx + rIn * Math.cos(angle)}
        y1={cy + rIn * Math.sin(angle)}
        x2={cx + r * Math.cos(angle)}
        y2={cy + r * Math.sin(angle)}
        stroke={major ? 'var(--itu-ink-faint)' : 'var(--itu-border)'}
        strokeWidth={major ? 2.2 : 1.5}
        strokeLinecap="round"
      />,
    );
  }
  return <g>{ticks}</g>;
}
