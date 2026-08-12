import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, Calendar, Check, Clock3, FileText, Flag, List, LoaderCircle, Plus, Sprout } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Habit, ProductivityTask, TaskPriority } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Card, CardContent } from '@/shared/ui/card';
import { Label } from '@/shared/ui/label';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
import { parseTaskTitleInput } from '../planning/utils/parseTaskTitleInput';
import { TaskList } from '../planning/components/TaskList';
import { TaskDetailModal } from '../planning/components/TaskDetailModal';
import { TaskContextMenu } from '../planning/components/TaskContextMenu';
import {
  formatTaskDate,
  TaskOptionChip,
  taskPriorityLabel,
  TaskSettingsMenu,
} from '../planning/components/TaskSettingsMenu';
import { getStoredTaskDefaults } from '@/shared/taskDefaults';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { TodaySettingsPopover, DEFAULT_TODAY_SETTINGS, type TodaySettings } from './TodaySettingsPopover';
import { HomeOverview } from '../dashboard/HomeOverview';
import { HabitDetail, HabitIconBadge } from '../habits';

export function TodayPage() {
  const [todaySettings, setTodaySettings] = useState<TodaySettings>(DEFAULT_TODAY_SETTINGS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    task: ProductivityTask;
    position: { x: number; y: number };
  } | null>(null);
  const [quickTask, setQuickTask] = useState('');
  const [quickDueAt, setQuickDueAt] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>(() => getStoredTaskDefaults().priority);
  const [quickTaskListId, setQuickTaskListId] = useState('');
  const [quickTagIds, setQuickTagIds] = useState<string[]>([]);
  const [quickDescription, setQuickDescription] = useState('');
  const [quickRemindAt, setQuickRemindAt] = useState('');

  const [isInputFocused, setIsInputFocused] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const tasksToday = useQuery({ queryKey: ['tasks', 'today'], queryFn: () => api.tasks({ view: 'today' }) });
  const allTasks = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.tasks({ view: 'all' }),
    enabled: !!selectedTaskId,
  });
  const habits = useQuery({
    queryKey: ['habit-occurrences', today],
    queryFn: () => api.habitOccurrences(today, today),
  });
  const habitTimeBlocks = useQuery({
    queryKey: ['habit-time-blocks'],
    queryFn: () => api.habitTimeBlocks(),
  });
  const focus = useQuery({ queryKey: ['focus', 'active'], queryFn: () => api.activeFocus() });
  const taskOptionsOpen =
    isInputFocused ||
    quickTask.trim().length > 0 ||
    quickPriority !== 'NONE' ||
    Boolean(quickDueAt) ||
    Boolean(quickRemindAt) ||
    Boolean(quickDescription.trim()) ||
    Boolean(quickTaskListId) ||
    quickTagIds.length > 0;
  const projects = useQuery({
    queryKey: ['task-lists'],
    queryFn: () => api.taskLists(),
    enabled: taskOptionsOpen,
  });
  const tags = useQuery({
    queryKey: ['task-tags'],
    queryFn: () => api.taskTags(),
    enabled: taskOptionsOpen || Boolean(selectedHabit),
  });

  const toggleHabit = useMutation({
    mutationFn: ({
      id,
      value,
      completed,
      idempotencyKey,
    }: {
      id: string;
      value: number;
      completed: boolean;
      idempotencyKey: string;
    }) =>
      completed
        ? api.habitOccurrenceAction(id, 'undo', idempotencyKey)
        : api.checkInHabit(id, { value, idempotencyKey }),
  });

  const createTask = useMutation({
    mutationFn: async () => {
      const parsed = parseTaskTitleInput(quickTask);
      const titleToSave = parsed.cleanTitle || quickTask.trim();
      const priorityToSave = parsed.priority ?? quickPriority;
      const dueAtToSave = parsed.dueAtDateString ?? quickDueAt;

      const task = await api.createTask({
        title: titleToSave,
        descriptionMarkdown: quickDescription.trim() || undefined,
        taskListId: quickTaskListId || undefined,
        priority: priorityToSave,
        dueAt: todayTaskDueAt(dueAtToSave),
        tagIds: quickTagIds.length ? quickTagIds : undefined,
      });
      if (quickRemindAt) {
        await api.createTaskReminder(task.id, { remindAt: new Date(quickRemindAt).toISOString() });
      }
      return task;
    },
    onSuccess: () => {
      setQuickTask('');
      setQuickDescription('');
      setQuickDueAt('');
      setQuickRemindAt('');
      setQuickPriority(getStoredTaskDefaults().priority);
      setQuickTaskListId('');
      setQuickTagIds([]);
    },
  });

  function handleQuickTaskSubmit(event: FormEvent) {
    event.preventDefault();
    if (quickTask.trim() && !createTask.isPending) createTask.mutate();
  }

  const todayTasks = tasksToday.data?.data ?? [];
  const allTaskItems = allTasks.data?.data ?? [];
  const completedTasks = todayTasks.filter((task) => task.status === 'COMPLETED').length;
  const habitCompletedCount = habits.data?.filter((item) => item.status === 'COMPLETED').length ?? 0;
  const habitTotalCount = habits.data?.length ?? 0;
  const selectedTask =
    allTaskItems.find((task) => task.id === selectedTaskId) ??
    todayTasks.find((task) => task.id === selectedTaskId) ??
    null;
  const hasTaskOptions =
    quickPriority !== 'NONE' ||
    Boolean(quickDueAt) ||
    Boolean(quickRemindAt) ||
    Boolean(quickDescription.trim()) ||
    Boolean(quickTaskListId) ||
    quickTagIds.length > 0;

  return (
    <div className="itu-today space-y-6">
      <PageHeader
        kicker="Overview & Workspace"
        title="Home"
        description="Daily progress, active focus session, and skill attributes."
      >
        <FeatureSettingsButton title="Today settings">
          <TodaySettingsPopover settings={todaySettings} onChange={(patch) => setTodaySettings((s) => ({ ...s, ...patch }))} />
        </FeatureSettingsButton>
      </PageHeader>
      <HomeOverview />

      {focus.data && (
        <section
          className="itu-gradient-card flex flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center"
          aria-labelledby="active-focus-heading"
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'rgba(237,243,240,0.12)' }}
            aria-hidden="true"
          >
            <Clock3 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-[rgba(237,243,240,0.65)]">
              Focus session in progress
            </p>
            <h2 id="active-focus-heading" className="mt-1 truncate text-lg font-semibold text-[#EDF3F0]">
              {focus.data.customTitle || focus.data.taskTitleSnapshot || 'Untitled focus session'}
            </h2>
          </div>
          <Link
            to="/focus"
            className="shrink-0 rounded-lg border-none px-4 py-2 text-xs font-semibold text-[#EDF3F0] no-underline bg-[rgba(237,243,240,0.14)] backdrop-blur-sm hover:bg-[rgba(237,243,240,0.2)] transition-colors"
          >
            Continue →
          </Link>
        </section>
      )}

      <div className="itu-today__work-grid">
        <section className="min-w-0" aria-labelledby="today-tasks-heading">
          <div className="itu-section-heading mb-3.5">
            <div>
              <h2 id="today-tasks-heading" className="text-lg font-semibold tracking-tight text-foreground m-0">
                Today's tasks
              </h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              {completedTasks} of {todayTasks.length} completed
            </span>
          </div>

          <Card className="itu-work-card rounded-xl border border-border shadow-[var(--shadow-soft)]">
            <CardContent className="p-0">
              {/* Task input row */}
              <div className="flex flex-col items-stretch gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
                <div className="flex min-h-0 flex-1 items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5">
                  <Plus size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <Label htmlFor="today-quick-task" className="sr-only">
                    Add a task for today
                  </Label>
                  <input
                    id="today-quick-task"
                    value={quickTask}
                    onChange={(event) => setQuickTask(event.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
                    placeholder="What needs to get done? (try '!high' or '#today')"
                    autoComplete="off"
                    className="flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground min-w-0"
                  />
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2.5">
                  {(isInputFocused || quickTask.trim().length > 0 || hasTaskOptions) && (
                    <>
                      <DatePickerPopover
                        value={quickDueAt}
                        onChange={(value) => setQuickDueAt(value ?? '')}
                        align="end"
                        trigger={
                          <button
                            type="button"
                            className={`itu-icon-button ${quickDueAt ? 'is-active' : ''}`}
                            aria-label={
                              quickDueAt ? `Change due date, ${formatTaskDate(quickDueAt, '')}` : 'Set due date'
                            }
                            title="Set due date"
                          >
                            <Calendar aria-hidden="true" />
                          </button>
                        }
                      />
                      <TaskSettingsMenu
                        idPrefix="home"
                        priority={quickPriority}
                        setPriority={setQuickPriority}
                        dueAt={quickDueAt}
                        setDueAt={setQuickDueAt}
                        remindAt={quickRemindAt}
                        setRemindAt={setQuickRemindAt}
                        description={quickDescription}
                        setDescription={setQuickDescription}
                        taskListId={quickTaskListId}
                        setTaskListId={setQuickTaskListId}
                        projects={projects.data ?? []}
                        tagIds={quickTagIds}
                        setTagIds={setQuickTagIds}
                        tags={tags.data ?? []}
                        hasOptions={hasTaskOptions}
                      />
                    </>
                  )}
                  <button
                    type="submit"
                    onClick={handleQuickTaskSubmit}
                    disabled={!quickTask.trim() || createTask.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {createTask.isPending ? (
                      <LoaderCircle className="motion-safe:animate-spin" size={14} aria-hidden="true" />
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    )}
                    Add
                  </button>
                </div>
              </div>

              {/* Task options chips */}
              {hasTaskOptions && (
                <div className="flex flex-wrap gap-2 pt-2 px-5 border-t border-border" aria-label="Task options">
                  {quickPriority !== 'NONE' && (
                    <TaskOptionChip
                      icon={Flag}
                      label={taskPriorityLabel(quickPriority)}
                      onRemove={() => setQuickPriority('NONE')}
                    />
                  )}
                  {quickDueAt && (
                    <TaskOptionChip
                      icon={Calendar}
                      label={`Due ${formatTaskDate(quickDueAt, '')}`}
                      onRemove={() => setQuickDueAt('')}
                    />
                  )}
                  {quickRemindAt && (
                    <TaskOptionChip icon={Bell} label="Reminder set" onRemove={() => setQuickRemindAt('')} />
                  )}
                  {quickDescription.trim() && (
                    <TaskOptionChip icon={FileText} label="Notes added" onRemove={() => setQuickDescription('')} />
                  )}
                  {quickTaskListId && (
                    <TaskOptionChip
                      icon={List}
                      label={projects.data?.find((project) => project.id === quickTaskListId)?.title ?? 'Selected list'}
                      onRemove={() => setQuickTaskListId('')}
                    />
                  )}
                  {quickTagIds.map((tagId) => (
                    <TaskOptionChip
                      key={tagId}
                      label={`#${tags.data?.find((tag) => tag.id === tagId)?.name ?? 'tag'}`}
                      onRemove={() => setQuickTagIds((current) => current.filter((id) => id !== tagId))}
                    />
                  ))}
                </div>
              )}

              {/* Task list */}
              <div style={{ padding: '20px' }}>
                {tasksToday.isLoading ? (
                  <TaskListSkeleton />
                ) : tasksToday.isError ? (
                  <QueryError message="Today's tasks could not be loaded." onRetry={() => tasksToday.refetch()} />
                ) : (
                  <TaskList
                    tasks={todayTasks}
                    selectedTaskId={selectedTaskId}
                    onSelect={setSelectedTaskId}
                    onContextMenu={(task, position) => setContextMenu({ task, position })}
                    compact
                    showDetails
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="min-w-0" aria-labelledby="daily-habits-heading">
          <div className="itu-section-heading" style={{ marginBottom: '14px' }}>
            <div>
              <h2 id="daily-habits-heading" className="font-serif font-medium" style={{ fontSize: '19px', margin: 0 }}>
                Daily habits
              </h2>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="font-mono text-xs text-[var(--itu-teal-600)] dark:text-[var(--itu-teal-400)]"
            >
              <Link to="/habits">
                {habitCompletedCount} of {habitTotalCount} checked in →
              </Link>
            </Button>
          </div>

          <Card className="itu-habits-card rounded-[20px] border border-border shadow-[var(--itu-shadow-card)]">
            <CardContent className="p-0">
              {habits.isLoading ? (
                <div style={{ padding: '24px' }}>
                  <TaskListSkeleton rows={3} />
                </div>
              ) : habits.isError ? (
                <div style={{ padding: '24px' }}>
                  <QueryError message="Habits could not be loaded." onRetry={() => habits.refetch()} />
                </div>
              ) : habits.data?.length ? (
                <div style={{ padding: '12px' }}>
                  <ul className="divide-y divide-border/60">
                    {habits.data.map((item) => {
                      const done = item.status === 'COMPLETED';
                      return (
                        <li key={item.id} className="itu-habit-row">
                          <button
                            type="button"
                            onClick={() => setSelectedHabit(item.habit)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg cursor-pointer p-0.5 hover:bg-accent/40 transition-colors"
                            title={`View details for ${item.habit.name}`}
                          >
                            <HabitIconBadge icon={item.habit.icon} color={item.habit.color} />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-sm font-medium ${done ? 'text-muted-foreground line-through' : ''}`}
                              >
                                {item.habit.name}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.habit.targetValue} {item.habit.unit || 'completion'}
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            className={`itu-check-button ${done ? 'is-done' : ''}`}
                            onClick={() =>
                              toggleHabit.mutate({
                                id: item.id,
                                value: item.habit.targetValue,
                                completed: done,
                                idempotencyKey: `today:${item.id}:${done ? 'undo' : 'checkin'}:${crypto.randomUUID()}`,
                              })
                            }
                            disabled={toggleHabit.isPending}
                            aria-label={`${done ? 'Completed' : 'Check in'}: ${item.habit.name}`}
                            aria-pressed={done}
                          >
                            <Check aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center" style={{ padding: '34px 24px' }}>
                  <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[var(--itu-mint-100)] text-[var(--itu-teal-900)] mb-3.5">
                    <Sprout size={22} aria-hidden="true" />
                  </div>
                  <h3 className="font-serif font-semibold" style={{ fontSize: '17px', margin: '0 0 6px' }}>
                    A clear day
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">No habits are scheduled for today.</p>
                  <Link
                    to="/habits"
                    className="inline-flex items-center gap-2 font-body text-xs font-bold rounded-[9px] border border-border bg-card px-4 py-2 text-foreground transition-colors hover:bg-muted"
                  >
                    Manage habits
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <TaskDetailModal
        task={selectedTask}
        tasks={allTaskItems}
        isOpen={Boolean(selectedTaskId)}
        onClose={() => setSelectedTaskId(null)}
      />
      <TaskContextMenu
        task={contextMenu?.task ?? null}
        position={contextMenu?.position ?? null}
        onClose={() => setContextMenu(null)}
        onOpenDetail={() => {
          if (contextMenu) setSelectedTaskId(contextMenu.task.id);
        }}
      />
      <HabitDetail
        habit={selectedHabit}
        open={!!selectedHabit}
        onOpenChange={(open) => !open && setSelectedHabit(null)}
        timeBlocks={habitTimeBlocks.data ?? []}
        tags={tags.data ?? []}
      />
    </div>
  );
}

function TaskListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="itu-query-state" role="alert">
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function todayTaskDueAt(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
