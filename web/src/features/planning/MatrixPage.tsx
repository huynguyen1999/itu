import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskInput, TaskList as TaskListModel, TaskPriority } from '@/shared/api/types';
import { TaskList } from './components/TaskList';
import { TaskDetailModal } from './components/TaskDetailModal';
import { TaskContextMenu } from './components/TaskContextMenu';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Input } from '@/shared/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Calendar, ChevronDown, Flag, ListFilter, Plus, Search, X } from 'lucide-react';
import { applyManualTaskOrder, reorderedTaskIds, sortTasks } from './PlanningPage';
import type { SortMode } from './PlanningPage';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import {
  MatrixSettingsPopover,
  DEFAULT_MATRIX_DISPLAY_SETTINGS,
  type MatrixViewDisplaySettings,
} from './MatrixSettingsPopover';
import type { MatrixPreferences } from '@/shared/api/preferencesApi';
import { matrixQuadrantForTask, readMatrixSettings, saveMatrixSettings } from './utils/matrixSettings';
import { getStoredTaskDefaults } from '@/shared/taskDefaults';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';

const columns: Array<[string, string, string, string, string, string]> = [
  [
    'doFirst',
    'Do now',
    'Important + urgent',
    'from-red-500/20 to-red-400/10',
    'border-red-500/30',
    'text-red-700 dark:text-red-400',
  ],
  [
    'schedule',
    'Schedule',
    'Important + not urgent',
    'from-orange-500/20 to-orange-400/10',
    'border-orange-500/30',
    'text-orange-700 dark:text-orange-400',
  ],
  [
    'delegate',
    'Delegate or minimize',
    'Not important + urgent',
    'from-blue-500/20 to-blue-400/10',
    'border-blue-500/30',
    'text-blue-700 dark:text-blue-400',
  ],
  [
    'dontDo',
    'Eliminate',
    'Not important + not urgent',
    'from-slate-500/20 to-slate-400/10',
    'border-slate-500/30',
    'text-slate-700 dark:text-slate-400',
  ],
];

/** Map from quadrant key to the task metadata presets for quick-create. */
const quadrantPresets: Record<string, { important: boolean; urgentOverride: boolean | null }> = {
  doFirst: { important: true, urgentOverride: true },
  schedule: { important: true, urgentOverride: false },
  delegate: { important: false, urgentOverride: true },
  dontDo: { important: false, urgentOverride: false },
};

type PriorityFilter = TaskPriority | 'ALL';

export function MatrixPage() {
  const queryClient = useQueryClient();
  const [matrixSettings, setMatrixSettings] = useState(readMatrixSettings);
  const [matrixDisplaySettings, setMatrixDisplaySettings] = useState<MatrixViewDisplaySettings>(DEFAULT_MATRIX_DISPLAY_SETTINGS);
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateMatrixPref = useMutation({
    mutationFn: (patch: Partial<MatrixPreferences>) => api.updateMatrixPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    task: ProductivityTask;
    position: { x: number; y: number };
  } | null>(null);

  // Search and filter state
  const searchInputRef = useRef<HTMLInputElement>(null);

  // New task dialog state
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [newTaskQuadrant, setNewTaskQuadrant] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>(() => getStoredTaskDefaults().priority);
  const [quickDueAt, setQuickDueAt] = useState('');

  const matrix = useQuery({ queryKey: ['tasks', 'matrix'], queryFn: () => api.taskMatrix() });
  const taskLists = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const { searchQuery, showSearch, sortMode } = matrixSettings;
  const priorityFilter = useMemo(
    () => new Set<PriorityFilter>(matrixSettings.priorityFilter),
    [matrixSettings.priorityFilter],
  );

  useEffect(() => saveMatrixSettings(matrixSettings), [matrixSettings]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const allTasks = useMemo(() => {
    if (!matrix.data) return [];
    return attachTaskLists(Object.values(matrix.data).flat(), taskLists.data ?? []);
  }, [matrix.data, taskLists.data]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return allTasks.find((t) => t.id === selectedTaskId) ?? null;
  }, [allTasks, selectedTaskId]);

  // Compute filtered tasks per quadrant, split into active / completed / won't-do buckets
  const { quadrantTaskMap, quadrantCompletedMap, quadrantWontDoMap } = useMemo(() => {
    const active: Record<string, ProductivityTask[]> = Object.fromEntries(columns.map(([key]) => [key, []]));
    const completed: Record<string, ProductivityTask[]> = Object.fromEntries(columns.map(([key]) => [key, []]));
    const wontDo: Record<string, ProductivityTask[]> = Object.fromEntries(columns.map(([key]) => [key, []]));

    if (matrix.data) {
      const tasksByQuadrant: Record<string, ProductivityTask[]> = {};
      for (const task of allTasks) {
        const key = matrixQuadrantForTask(task, matrixSettings);
        (tasksByQuadrant[key] ??= []).push(task);
      }
      for (const [key] of columns) {
        const buckets = bucketTasksByStatus(tasksByQuadrant[key] ?? []);
        active[key] = buckets.active;
        completed[key] = buckets.completed;
        wontDo[key] = buckets.wontDo;
      }
    }

    const hasSpecificPriority = !priorityFilter.has('ALL') && priorityFilter.size > 0;
    for (const [key] of columns) {
      const filterAndSort = (tasks: ProductivityTask[]) => {
        let filtered = tasks;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter((task) => task.title.toLowerCase().includes(q));
        }
        if (hasSpecificPriority) {
          filtered = filtered.filter((task) => priorityFilter.has(task.priority));
        }
        return sortTasks(filtered, sortMode);
      };
      active[key] = filterAndSort(active[key]);
      completed[key] = filterAndSort(completed[key]);
      wontDo[key] = filterAndSort(wontDo[key]);
    }

    return { quadrantTaskMap: active, quadrantCompletedMap: completed, quadrantWontDoMap: wontDo };
  }, [allTasks, matrix.data, matrixSettings, searchQuery, priorityFilter, sortMode]);

  const moveTask = useMutation({
    mutationFn: async ({
      taskId,
      targetQuadrant,
      beforeTaskId,
    }: {
      taskId: string;
      targetQuadrant: string;
      beforeTaskId?: string;
    }) => {
      const groups = columns.map(([key]) => [key, quadrantTaskMap[key] ?? []] as [string, ProductivityTask[]]);
      const draggedTask = groups.flatMap(([, tasks]) => tasks).find((task) => task.id === taskId);
      if (!draggedTask) return;
      const targetPreset = quadrantPresets[targetQuadrant];
      const patch: Partial<TaskInput> = targetPreset
        ? {
            important: targetPreset.important,
            urgentOverride: targetPreset.urgentOverride,
          }
        : {};
      const orderedTaskIds = reorderedTaskIds(groups, taskId, targetQuadrant, beforeTaskId);
      queryClient.setQueryData<typeof matrix.data>(['tasks', 'matrix'], (current) => {
        if (!current) return current;
        const reordered = applyManualTaskOrder(Object.values(current).flat(), orderedTaskIds, taskId, patch);
        const taskById = new Map(reordered.map((task) => [task.id, task]));
        return Object.fromEntries(
          Object.entries(current).map(([key, tasks]) => [key, tasks.map((task) => taskById.get(task.id) ?? task)]),
        ) as typeof current;
      });
      if (targetPreset) {
        await api.updateTask(taskId, { ...patch, version: draggedTask.version });
      }
      await api.reorderTasks(orderedTaskIds);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onSettled: () => setDraggedTaskId(null),
  });

  // Create task mutation
  const createTask = useMutation({
    mutationFn: (overrides?: Partial<TaskInput>) => {
      const presets = newTaskQuadrant ? quadrantPresets[newTaskQuadrant] : null;
      return api.createTask({
        title: quickTitle.trim(),
        priority: quickPriority,
        important: presets?.important ?? false,
        urgentOverride: presets?.urgentOverride ?? null,
        dueAt: quickDueAt ? new Date(quickDueAt).toISOString() : undefined,
        ...overrides,
      });
    },
    onSuccess: () => {
      setQuickTitle('');
      setQuickDueAt('');
      setQuickPriority(getStoredTaskDefaults().priority);
      setNewTaskQuadrant(null);
      setShowNewTaskDialog(false);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  function handleQuickCreate(event: FormEvent) {
    event.preventDefault();
    if (quickTitle.trim()) createTask.mutate(undefined);
  }

  function openNewTaskDialog(quadrantKey?: string) {
    setNewTaskQuadrant(quadrantKey ?? null);
    setShowNewTaskDialog(true);
    setQuickTitle('');
    setQuickDueAt('');
    setQuickPriority(getStoredTaskDefaults().priority);
  }

  function togglePriorityFilter(priority: TaskPriority) {
    setMatrixSettings((settings) => {
      const next = new Set(settings.priorityFilter);
      next.delete('ALL');
      if (next.has(priority)) {
        next.delete(priority);
        if (next.size === 0) next.add('ALL');
      } else {
        next.add(priority);
      }
      return { ...settings, priorityFilter: [...next] };
    });
  }

  function clearFilters() {
    setMatrixSettings((settings) => ({
      ...settings,
      searchQuery: '',
      showSearch: false,
      priorityFilter: ['ALL'],
      sortMode: 'manual',
    }));
  }

  const hasActiveFilters =
    searchQuery || (!priorityFilter.has('ALL') && priorityFilter.size > 0) || sortMode !== 'manual';

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4 overflow-hidden">
      <div className="flex flex-1 flex-col gap-4 min-h-0 overflow-hidden">
        {/* Header row */}
        <PageHeader
          kicker="Prioritization & Matrix"
          title="Eisenhower Matrix"
          stickyControls={
            showSearch ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setMatrixSettings((settings) => ({ ...settings, searchQuery: e.target.value }))}
                  placeholder="Search tasks across all quadrants…"
                  className="h-10 pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setMatrixSettings((settings) => ({ ...settings, searchQuery: '' }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : null
          }
        >
          <div className="flex items-center gap-2">
            {/* Search toggle button */}
            <Button
              variant={showSearch ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="Search tasks"
              onClick={() => setMatrixSettings((settings) => ({ ...settings, showSearch: !settings.showSearch }))}
            >
              <Search className="h-4 w-4" />
            </Button>

            {/* Filter / Sort dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={hasActiveFilters && sortMode !== 'manual' ? 'secondary' : 'ghost'}
                  size="icon"
                  aria-label="Filter and sort tasks"
                >
                  <ListFilter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter &amp; Sort</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ListFilter />
                    Sort by
                    <span className="ml-auto mr-2 text-xs text-muted-foreground">{sortLabel(sortMode)}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuRadioGroup
                      value={sortMode}
                      onValueChange={(value) =>
                        setMatrixSettings((settings) => ({ ...settings, sortMode: value as SortMode }))
                      }
                    >
                      <DropdownMenuRadioItem value="manual">Manual order</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="due">Due date</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="title">Title</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag />
                    Priority
                    <span className="ml-auto mr-2 text-xs text-muted-foreground">
                      {priorityFilterLabel(priorityFilter)}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuCheckboxItem
                      checked={priorityFilter.has('ALL')}
                      onCheckedChange={() =>
                        setMatrixSettings((settings) => ({ ...settings, priorityFilter: ['ALL'] }))
                      }
                    >
                      All priorities
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={priorityFilter.has('HIGH')}
                      onCheckedChange={() => togglePriorityFilter('HIGH')}
                    >
                      <Flag className="mr-2 h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                      High
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={priorityFilter.has('MEDIUM')}
                      onCheckedChange={() => togglePriorityFilter('MEDIUM')}
                    >
                      <Flag className="mr-2 h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                      Medium
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={priorityFilter.has('LOW')}
                      onCheckedChange={() => togglePriorityFilter('LOW')}
                    >
                      <Flag className="mr-2 h-3.5 w-3.5 fill-blue-500 text-blue-500" />
                      Low
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {hasActiveFilters && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={clearFilters}>Restore defaults</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* New task button */}
            <Button size="sm" className="gap-2" onClick={() => openNewTaskDialog()}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New task</span>
            </Button>

            {/* Matrix settings gear */}
            <FeatureSettingsButton title="Matrix settings">
              <MatrixSettingsPopover
                preferences={userPreferences.data?.matrix}
                displaySettings={matrixDisplaySettings}
                onChangePreferences={(patch) => updateMatrixPref.mutate(patch)}
                onChangeDisplay={(patch) => setMatrixDisplaySettings((current) => ({ ...current, ...patch }))}
              />
            </FeatureSettingsButton>
          </div>
        </PageHeader>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {searchQuery && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                <Search className="h-3 w-3" />"{searchQuery}"
                <button
                  onClick={() => setMatrixSettings((settings) => ({ ...settings, searchQuery: '', showSearch: false }))}
                  className="ml-0.5 hover:text-foreground"
                  aria-label="Remove search filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {!priorityFilter.has('ALL') &&
              ([...priorityFilter] as TaskPriority[]).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                >
                  <Flag
                    className={`h-3 w-3 ${p === 'HIGH' ? 'fill-rose-500 text-rose-500' : p === 'MEDIUM' ? 'fill-amber-500 text-amber-500' : 'fill-blue-500 text-blue-500'}`}
                  />
                  {p.toLowerCase()}
                  <button
                    onClick={() => togglePriorityFilter(p)}
                    className="ml-0.5 hover:text-foreground"
                    aria-label={`Remove ${p} filter`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            {sortMode !== 'manual' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                <ListFilter className="h-3 w-3" />
                Sort: {sortLabel(sortMode)}
              </span>
            )}
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Matrix grid */}
        <div className="grid flex-1 grid-cols-1 grid-rows-4 gap-3 min-h-0 overflow-hidden md:grid-cols-2 md:grid-rows-2">
          {columns.map(([key, title, subtitle, bgGradient, borderColor, textColor]) => {
            const quadrantTasks = quadrantTaskMap[key] ?? [];
            const completedTasks = quadrantCompletedMap[key] ?? [];
            const wontDoTasks = quadrantWontDoMap[key] ?? [];
            return (
              <section
                key={key}
                className={`flex flex-col min-h-0 overflow-hidden rounded-xl border bg-gradient-to-br ${bgGradient} ${borderColor} p-4 shadow-sm transition-all hover:shadow-md ${
                  draggedTaskId && sortMode === 'manual' ? 'ring-1 ring-primary/20' : ''
                }`}
                onDragOver={(event) => {
                  if (!draggedTaskId || sortMode !== 'manual') return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => {
                  if (!draggedTaskId || sortMode !== 'manual') return;
                  event.preventDefault();
                  moveTask.mutate({ taskId: draggedTaskId, targetQuadrant: key });
                }}
              >
                <div className="shrink-0 mb-2">
                  <div className="flex items-center justify-between">
                    <h2 className={`font-bold text-sm sm:text-base ${textColor}`}>{title}</h2>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-full bg-gradient-to-r ${bgGradient} px-2.5 py-1 text-xs font-semibold ${textColor}`}
                      >
                        {quadrantTasks.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 rounded-full hover:bg-black/10 dark:hover:bg-white/10 ${textColor}`}
                        onClick={() => openNewTaskDialog(key)}
                        title={`Add task to ${title}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className={`text-xs ${textColor} opacity-75`}>{subtitle}</p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  <TaskList
                    tasks={quadrantTasks}
                    selectedTaskId={selectedTaskId}
                    onSelect={setSelectedTaskId}
                    onContextMenu={(task, position) => setContextMenu({ task, position })}
                    compact
                    density="matrix"
                    showTaskList
                    draggable={sortMode === 'manual'}
                    onTaskDragStart={setDraggedTaskId}
                    onTaskDrop={(beforeTaskId) => {
                      if (draggedTaskId && draggedTaskId !== beforeTaskId) {
                        moveTask.mutate({ taskId: draggedTaskId, targetQuadrant: key, beforeTaskId });
                      }
                    }}
                    onTaskDragEnd={() => setDraggedTaskId(null)}
                  />
                  {completedTasks.length > 0 && (
                    <CollapsibleTaskSection
                      label="Completed"
                      tasks={completedTasks}
                      selectedTaskId={selectedTaskId}
                      onSelect={setSelectedTaskId}
                      onContextMenu={(task, position) => setContextMenu({ task, position })}
                    />
                  )}
                  {wontDoTasks.length > 0 && (
                    <CollapsibleTaskSection
                      label="Won't do"
                      tasks={wontDoTasks}
                      selectedTaskId={selectedTaskId}
                      onSelect={setSelectedTaskId}
                      onContextMenu={(task, position) => setContextMenu({ task, position })}
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Floating Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        tasks={allTasks}
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />

      {/* Right-Click Context Menu */}
      <TaskContextMenu
        task={contextMenu?.task ?? null}
        position={contextMenu?.position ?? null}
        onClose={() => setContextMenu(null)}
        onOpenDetail={() => {
          if (contextMenu) {
            setSelectedTaskId(contextMenu.task.id);
          }
        }}
      />

      {/* New Task Dialog */}
      <Dialog
        open={showNewTaskDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewTaskDialog(false);
            setNewTaskQuadrant(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newTaskQuadrant ? `New task — ${columns.find(([k]) => k === newTaskQuadrant)?.[1] ?? ''}` : 'New task'}
            </DialogTitle>
            <DialogDescription>
              {newTaskQuadrant
                ? `This task will be placed in the "${columns.find(([k]) => k === newTaskQuadrant)?.[1] ?? ''}" quadrant.`
                : 'Create a new task. You can move it between quadrants later.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleQuickCreate} className="space-y-4">
            <div>
              <label htmlFor="new-task-title" className="mb-1.5 block text-sm font-medium">
                Title
              </label>
              <Input
                id="new-task-title"
                autoFocus
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="What needs to be done?"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Priority</label>
              <div className="flex items-center gap-2">
                {(['NONE', 'LOW', 'MEDIUM', 'HIGH'] as TaskPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setQuickPriority(p)}
                    className={`flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors ${
                      quickPriority === p
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-input text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Flag
                      className={`h-3.5 w-3.5 ${
                        p === 'HIGH'
                          ? 'fill-rose-500 text-rose-500'
                          : p === 'MEDIUM'
                            ? 'fill-amber-500 text-amber-500'
                            : p === 'LOW'
                              ? 'fill-blue-500 text-blue-500'
                              : 'text-muted-foreground'
                      }`}
                    />
                    {p === 'NONE' ? 'None' : p.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Due date</label>
              <DatePickerPopover
                value={quickDueAt}
                onChange={(value) => setQuickDueAt(value ?? '')}
                trigger={
                  <button
                    type="button"
                    className={`flex h-10 w-full items-center gap-2 rounded-md border bg-background px-3 text-left text-sm transition-colors hover:bg-muted ${
                      quickDueAt ? 'border-primary' : 'border-input text-muted-foreground'
                    }`}
                  >
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{quickDueAt ? new Date(quickDueAt).toLocaleDateString() : 'No due date'}</span>
                  </button>
                }
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowNewTaskDialog(false);
                  setNewTaskQuadrant(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!quickTitle.trim() || createTask.isPending}>
                {createTask.isPending ? 'Creating…' : 'Create task'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function attachTaskLists(tasks: ProductivityTask[], taskLists: TaskListModel[]): ProductivityTask[] {
  const taskListById = new Map(taskLists.map((taskList) => [taskList.id, taskList]));
  return tasks.map((task) => ({
    ...task,
    taskList: task.taskList ?? taskListById.get(task.taskListId ?? '') ?? null,
  }));
}

export function bucketTasksByStatus(tasks: ProductivityTask[]) {
  const active: ProductivityTask[] = [];
  const completed: ProductivityTask[] = [];
  const wontDo: ProductivityTask[] = [];
  for (const task of tasks) {
    if (task.status === 'COMPLETED') completed.push(task);
    else if (task.status === 'CANCELED') wontDo.push(task);
    else active.push(task);
  }
  return { active, completed, wontDo };
}

function CollapsibleTaskSection({
  label,
  tasks,
  selectedTaskId,
  onSelect,
  onContextMenu,
}: {
  label: string;
  tasks: ProductivityTask[];
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (task: ProductivityTask, position: { x: number; y: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-t border-white/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 py-1.5 text-left text-xs font-semibold text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span>{label}</span>
        <span className="ml-auto text-muted-foreground/50">{tasks.length}</span>
      </button>
      {open && (
        <div className="max-h-none overflow-visible pr-1">
          <TaskList
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            compact
            density="matrix"
            showTaskList
          />
        </div>
      )}
    </div>
  );
}

function sortLabel(mode: SortMode) {
  return (
    {
      created: 'Created',
      'created-desc': 'Created newest',
      'created-asc': 'Created oldest',
      'modified-desc': 'Modified newest',
      'modified-asc': 'Modified oldest',
      manual: 'Manual order',
      due: 'Due date',
      priority: 'Priority',
      title: 'Title',
    } as const
  )[mode];
}

function priorityFilterLabel(priorityFilter: ReadonlySet<PriorityFilter>) {
  if (priorityFilter.has('ALL')) return 'All';
  const labels = [...priorityFilter].map((priority) => priority.toLowerCase());
  return labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`;
}
