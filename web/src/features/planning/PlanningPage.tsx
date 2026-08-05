import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bell,
  Calendar,
  CheckSquare2,
  ChevronDown,
  Columns3,
  EyeOff,
  FileText,
  Flag,
  List,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskInput, TaskPriority, TaskSection } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
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
import { TaskList } from './components/TaskList';
import { TaskDetailModal } from './components/TaskDetailModal';
import { TaskContextMenu } from './components/TaskContextMenu';
import { formatTaskDate, TaskOptionChip, taskPriorityLabel, TaskSettingsMenu } from './components/TaskSettingsMenu';
import { parseTaskTitleInput } from './utils/parseTaskTitleInput';
import { useGlobalUndo, useUndoStack, useUndoToast } from '@/shared/hooks/useUndoStack';
import { UndoToast } from '@/shared/ui/UndoToast';
import { getStoredTaskDefaults } from '@/shared/taskDefaults';
import { usePlanning } from './PlanningContext';
import { readPlanningViewSettings, savePlanningViewSettings } from './utils/planningViewSettings';

export function PlanningPage({ view = 'all' }: { view?: 'all' | 'today' | 'inbox' | 'upcoming' }) {
  const queryClient = useQueryClient();
  useGlobalUndo();
  const { push } = useUndoStack();
  const undoToast = useUndoToast();
  const planning = usePlanning();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{
    task: ProductivityTask;
    position: { x: number; y: number };
  } | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [quickTask, setQuickTask] = useState('');
  const [quickDueAt, setQuickDueAt] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>(() => getStoredTaskDefaults().priority);
  const [quickTaskListId, setQuickTaskListId] = useState('');
  const [quickTagIds, setQuickTagIds] = useState<string[]>([]);
  const [quickDescription, setQuickDescription] = useState('');
  const [quickRemindAt, setQuickRemindAt] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [showSectionCreator, setShowSectionCreator] = useState(false);
  const [viewSettings, setViewSettings] = useState(readPlanningViewSettings);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [allTasksData, setAllTasksData] = useState<ProductivityTask[]>([]);

  const { selectedTaskList, setSelectedTaskList, selectedTag, setSelectedTag, searchQuery, setSearchQuery } = planning;
  const selectedProject = selectedTaskList;
  const setSelectedProject = setSelectedTaskList;
  const { sortMode, groupMode, displayMode, hideCompleted, hideDetails, collapsedGroups } = viewSettings;

  useEffect(() => savePlanningViewSettings(viewSettings), [viewSettings]);

  const effectiveView = selectedTaskList || selectedTag || view === 'inbox' ? 'all' : view;
  const tasks = useInfiniteQuery({
    queryKey: ['tasks', effectiveView, selectedTaskList, selectedTag, searchQuery, 'paginated'],
    queryFn: async ({ pageParam }) => {
      const page = await api.tasks({
        view: effectiveView,
        taskListId: selectedTaskList ?? undefined,
        tagId: selectedTag ?? undefined,
        q: searchQuery || undefined,
        cursor: pageParam,
      });
      return Array.isArray(page) ? { data: page, meta: { hasNextPage: false, nextCursor: null } } : page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    retry: 1,
  });

  // Accumulate paginated task data
  useEffect(() => {
    if (tasks.data) {
      setAllTasksData(tasks.data.pages.flatMap((page) => page.data));
    }
  }, [tasks.data]);

  const sidebarTasks = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.tasks({ view: 'all' }),
    retry: 1,
    enabled: !!selectedTaskId,
  });
  const projects = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const inboxListId = projects.data?.find((project) => project.isDefault)?.id ?? null;
  const tags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });
  const sections = useQuery({ queryKey: ['task-sections'], queryFn: () => api.taskSections() });

  const createTask = useMutation({
    mutationFn: async () => {
      const parsed = parseTaskTitleInput(quickTask);
      const titleToSave = parsed.cleanTitle || quickTask.trim();
      const priorityToSave = parsed.priority ?? quickPriority;
      const dueAtToSave = parsed.dueAtDateString ?? quickDueAt;

      const targetTaskListId =
        quickTaskListId ||
        selectedTaskList ||
        (selectedProject ? selectedProject : view === 'inbox' ? undefined : undefined);
      const dueAt =
        view === 'today'
          ? dueAtToSave
            ? new Date(dueAtToSave).toISOString()
            : new Date().toISOString()
          : dueAtToSave
            ? new Date(dueAtToSave).toISOString()
            : undefined;
      const tagIds = quickTagIds.length ? quickTagIds : selectedTag ? [selectedTag] : undefined;

      const task = await api.createTask({
        title: titleToSave,
        descriptionMarkdown: quickDescription.trim() || undefined,
        taskListId: targetTaskListId || undefined,
        priority: priorityToSave,
        dueAt,
        tagIds,
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
      setQuickTagIds([]);
      setQuickTaskListId('');
    },
  });
  const createSection = useMutation({
    mutationFn: () => api.createTaskSection({ title: sectionTitle.trim(), taskListId: selectedTaskList }),
    onSuccess: async () => {
      setSectionTitle('');
      setShowSectionCreator(false);
      setViewSettings((settings) => ({ ...settings, groupMode: 'section' }));
      await queryClient.invalidateQueries({ queryKey: ['task-sections'] });
    },
  });

  useEffect(() => {
    if (selectedTaskId && !allTasksData.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [selectedTaskId, allTasksData]);

  useEffect(() => {
    const availableIds = new Set(allTasksData.map((task) => task.id));
    setSelectedTaskIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [allTasksData]);

  const selectedTask = allTasksData.find((task) => task.id === selectedTaskId) ?? null;
  const title = selectedProject
    ? (projects.data?.find((project) => project.id === selectedProject)?.title ?? 'Project')
    : selectedTag
      ? `#${tags.data?.find((tag) => tag.id === selectedTag)?.name ?? 'Tag'}`
      : view === 'inbox'
        ? 'Inbox'
        : view === 'today'
          ? 'Today'
          : view === 'upcoming'
            ? 'Next 7 Days'
            : 'All Tasks';
  const hasQuickTaskOptions =
    quickPriority !== 'NONE' ||
    Boolean(quickDueAt) ||
    Boolean(quickRemindAt) ||
    Boolean(quickDescription.trim()) ||
    Boolean(quickTaskListId) ||
    quickTagIds.length > 0;

  const groupedTasks = useMemo(
    () =>
      groupTasks(
        sortTasks(
          allTasksData.filter((task) => {
            // Inbox view includes unassigned/default-Inbox tasks that are completed, canceled,
            // or in INBOX status without a scheduled start date.
            if (view === 'inbox' && !selectedTaskList && !selectedTag) {
              if (!isInboxViewTask(task, inboxListId)) return false;
            }
            return !hideCompleted || (task.status !== 'COMPLETED' && task.status !== 'CANCELED');
          }),
          sortMode,
        ),
        view,
        groupMode,
        (sections.data ?? []).filter((section) =>
          selectedTaskList
            ? (section.taskListId ?? section.projectId) === selectedTaskList
            : view === 'inbox'
              ? !(section.taskListId ?? section.projectId)
              : true,
        ),
      ),
    [groupMode, hideCompleted, inboxListId, sections.data, selectedProject, sortMode, allTasksData, view],
  );
  const visibleTasks = useMemo(() => groupedTasks.flatMap(([, items]) => items), [groupedTasks]);
  const selectedTasks = useMemo(
    () => allTasksData.filter((task) => selectedTaskIds.has(task.id)),
    [selectedTaskIds, allTasksData],
  );
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  const bulkUpdateTasks = useMutation({
    mutationFn: (patch: Pick<Partial<TaskInput>, 'priority' | 'dueAt'>) =>
      Promise.all(selectedTasks.map((task) => api.updateTask(task.id, { ...patch, version: task.version }))),
    // Do NOT call invalidateQueries here — each api.updateTask() already applies an optimistic
    // update via applySyncChanges and enqueues a sync mutation. Calling invalidateQueries before
    // the server acknowledges those mutations causes a refetch that returns stale data (old
    // priority), overwriting the optimistic update and making the UI flicker back.
    // The cache is refreshed correctly once the server acknowledges the mutations via the
    // invalidateSyncChanges path in SyncProvider.
    onError: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const bulkDeleteTasks = useMutation({
    mutationFn: (tasksToDelete: ProductivityTask[]) =>
      Promise.all(tasksToDelete.map((task) => api.deleteTask(task.id))),
    onSuccess: (_, deletedTasks) => {
      setSelectedTaskIds(new Set());
      const undoAction = {
        label: deletedTasks.length === 1 ? 'Deleted 1 task' : `Deleted ${deletedTasks.length} tasks`,
        undo: async () => {
          await Promise.all(deletedTasks.map((task) => api.restoreTrashTask(task.id)));
        },
      };
      push(undoAction);
      undoToast.show(undoAction);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const moveTask = useMutation({
    mutationFn: async ({
      taskId,
      targetGroup,
      beforeTaskId,
    }: {
      taskId: string;
      targetGroup: string;
      beforeTaskId?: string;
    }) => {
      const draggedTask = visibleTasks.find((task) => task.id === taskId);
      if (!draggedTask) return;
      const patch = groupMovePatch(groupedTasks, targetGroup, draggedTask, groupMode, view, sections.data ?? []);
      const orderedTaskIds = reorderedTaskIds(groupedTasks, taskId, targetGroup, beforeTaskId);
      setAllTasksData((current) => applyManualTaskOrder(current, orderedTaskIds, taskId, patch));
      if (Object.keys(patch).length) await api.updateTask(taskId, { ...patch, version: draggedTask.version });
      await api.reorderTasks(orderedTaskIds);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onSettled: () => setDraggedTaskId(null),
  });

  function submitQuickTask(event: FormEvent) {
    event.preventDefault();
    if (quickTask.trim()) createTask.mutate();
  }

  return (
    <>
      <section className="itu-task-list-pane">
        <PageHeader
          kicker={selectedProject ? 'List' : selectedTag ? 'Tag' : 'Smart list'}
          title={title}
          className="px-5 pt-4"
        >
          <GroupAndSortMenu
            groupMode={groupMode}
            sortMode={sortMode}
            onGroupChange={(value) => setViewSettings((settings) => ({ ...settings, groupMode: value }))}
            onSortChange={(value) => setViewSettings((settings) => ({ ...settings, sortMode: value }))}
          />
          <ViewOptionsMenu
            displayMode={displayMode}
            hideCompleted={hideCompleted}
            hideDetails={hideDetails}
            onDisplayModeChange={(value) => setViewSettings((settings) => ({ ...settings, displayMode: value }))}
            onHideCompletedChange={(value) => setViewSettings((settings) => ({ ...settings, hideCompleted: value }))}
            onHideDetailsChange={(value) => setViewSettings((settings) => ({ ...settings, hideDetails: value }))}
            onAddSection={() => {
              setShowSectionCreator(true);
              setViewSettings((settings) => ({ ...settings, groupMode: 'section' }));
            }}
          />
        </PageHeader>

        <form
          className="itu-task-composer mx-5 mt-4 rounded-xl border shadow-[var(--shadow-soft)]"
          onSubmit={submitQuickTask}
        >
          <div className="itu-task-composer__main">
            <div className="itu-task-composer__input-wrap">
              <Plus className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <Label htmlFor="plan-quick-task" className="sr-only">
                Add a task
              </Label>
              <input
                id="plan-quick-task"
                value={quickTask}
                onChange={(event) => setQuickTask(event.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
                placeholder="What needs to get done? (try '!high' or '#today')"
                autoComplete="off"
              />
            </div>

            <div className="itu-task-composer__actions">
              {(isInputFocused || quickTask.trim().length > 0 || hasQuickTaskOptions) && (
                <>
                  <DatePickerPopover
                    value={quickDueAt}
                    onChange={(value) => setQuickDueAt(value ?? '')}
                    align="end"
                    trigger={
                      <button
                        type="button"
                        className={`itu-icon-button ${quickDueAt ? 'is-active' : ''}`}
                        aria-label={quickDueAt ? `Change due date, ${formatTaskDate(quickDueAt, '')}` : 'Set due date'}
                        title="Set due date"
                      >
                        <Calendar aria-hidden="true" />
                      </button>
                    }
                  />

                  <TaskSettingsMenu
                    idPrefix="plan"
                    priority={quickPriority}
                    setPriority={setQuickPriority}
                    dueAt={quickDueAt}
                    setDueAt={setQuickDueAt}
                    remindAt={quickRemindAt}
                    setRemindAt={setQuickRemindAt}
                    description={quickDescription}
                    setDescription={setQuickDescription}
                    taskListId={quickTaskListId || selectedTaskList || ''}
                    setTaskListId={setQuickTaskListId}
                    projects={projects.data ?? []}
                    tagIds={quickTagIds}
                    setTagIds={setQuickTagIds}
                    tags={tags.data ?? []}
                    hasOptions={hasQuickTaskOptions}
                  />
                </>
              )}

              <Button type="submit" size="sm" disabled={!quickTask.trim() || createTask.isPending}>
                {createTask.isPending ? (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Plus aria-hidden="true" />
                )}
                Add
              </Button>
            </div>
          </div>

          {hasQuickTaskOptions && (
            <div className="itu-task-composer__chips" aria-label="Task options">
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

          <p className="sr-only" role="status" aria-live="polite">
            {createTask.isPending
              ? 'Adding task'
              : createTask.isSuccess
                ? 'Task added'
                : createTask.isError
                  ? 'Task could not be added. Please try again.'
                  : ''}
          </p>
          {createTask.isError && (
            <p className="itu-inline-error" role="alert">
              Task could not be added. Check your connection and try again.
            </p>
          )}
        </form>
        {showSectionCreator && (
          <form
            className="itu-section-creator"
            onSubmit={(event) => {
              event.preventDefault();
              if (sectionTitle.trim()) createSection.mutate();
            }}
          >
            <Plus className="h-4 w-4" />
            <Input
              autoFocus
              value={sectionTitle}
              onChange={(event) => setSectionTitle(event.target.value)}
              placeholder="Section name, e.g. Processing"
              aria-label="Section name"
            />
            <Button size="sm" type="submit" disabled={!sectionTitle.trim() || createSection.isPending}>
              Add section
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setShowSectionCreator(false)}>
              Cancel
            </Button>
          </form>
        )}

        {!!selectedTaskIds.size && (
          <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2 shadow-sm">
            <span className="mr-1 flex items-center gap-2 text-sm font-semibold">
              <CheckSquare2 className="h-4 w-4 text-primary" />
              {selectedTaskIds.size} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={bulkUpdateTasks.isPending}>
                  <Flag className="h-3.5 w-3.5" />
                  Priority
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as TaskPriority[]).map((priority) => (
                  <DropdownMenuItem key={priority} onSelect={() => bulkUpdateTasks.mutate({ priority })}>
                    {priorityLabel(priority)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DatePickerPopover
              onChange={(dueAt) => bulkUpdateTasks.mutate({ dueAt: dueAt ?? null })}
              trigger={
                <Button size="sm" variant="outline" disabled={bulkUpdateTasks.isPending}>
                  <Calendar className="h-3.5 w-3.5" />
                  Due date
                </Button>
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setSelectedTaskIds(
                  selectedTaskIds.size === visibleTasks.length
                    ? new Set()
                    : new Set(visibleTasks.map((task) => task.id)),
                )
              }
            >
              {selectedTaskIds.size === visibleTasks.length ? 'Clear selection' : 'Select all'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={bulkUpdateTasks.isPending || bulkDeleteTasks.isPending}
              onClick={() => {
                if (selectedTasks.length) bulkDeleteTasks.mutate(selectedTasks);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              className="ml-auto"
              size="icon"
              variant="ghost"
              aria-label="Clear task selection"
              onClick={() => setSelectedTaskIds(new Set())}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="itu-task-scroll">
          {tasks.isLoading && <TaskListSkeleton />}
          {tasks.isError && (
            <div className="itu-task-error" role="alert">
              <AlertCircle className="h-5 w-5" />
              <div>
                <strong>Tasks could not load</strong>
                <p>{tasks.error instanceof Error ? tasks.error.message : 'The API request failed.'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void tasks.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {!tasks.isLoading &&
            !tasks.isError &&
            (displayMode === 'list' ? (
              groupedTasks.map(([group, groupTasks]) => {
                const isGroupCollapsed = collapsedGroups[group];
                return (
                  <section
                    key={group}
                    className={`itu-task-group ${draggedTaskId ? 'is-drop-target' : ''}`}
                    onDragOver={(event) => {
                      if (sortMode !== 'manual') return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      if (!draggedTaskId || sortMode !== 'manual') return;
                      event.preventDefault();
                      moveTask.mutate({ taskId: draggedTaskId, targetGroup: group });
                    }}
                  >
                    <h2
                      className="cursor-pointer select-none flex items-center gap-1.5"
                      onClick={() =>
                        setViewSettings((settings) => ({
                          ...settings,
                          collapsedGroups: { ...settings.collapsedGroups, [group]: !settings.collapsedGroups[group] },
                        }))
                      }
                    >
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                          isGroupCollapsed ? '-rotate-90' : ''
                        }`}
                      />
                      <span>{group}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                        {groupTasks.length}
                      </span>
                    </h2>
                    {!isGroupCollapsed && (
                      <TaskList
                        tasks={groupTasks}
                        allTasks={allTasksData}
                        selectedTaskId={selectedTaskId}
                        selectedTaskIds={selectedTaskIds}
                        onSelect={setSelectedTaskId}
                        onToggleSelection={toggleTaskSelection}
                        onContextMenu={(task, position) => setContextMenu({ task, position })}
                        compact
                        showDetails={!hideDetails}
                        showTaskList={groupMode !== 'project'}
                        draggable={sortMode === 'manual'}
                        onTaskDragStart={setDraggedTaskId}
                        onTaskDrop={(beforeTaskId) => {
                          if (draggedTaskId && draggedTaskId !== beforeTaskId) {
                            moveTask.mutate({ taskId: draggedTaskId, targetGroup: group, beforeTaskId });
                          }
                        }}
                        onTaskDragEnd={() => setDraggedTaskId(null)}
                        onUndoAction={undoToast.show}
                      />
                    )}
                  </section>
                );
              })
            ) : (
              <TaskKanban
                groups={groupedTasks}
                allTasks={allTasksData}
                selectedTaskId={selectedTaskId}
                selectedTaskIds={selectedTaskIds}
                onSelect={setSelectedTaskId}
                onToggleSelection={toggleTaskSelection}
                onContextMenu={(task, position) => setContextMenu({ task, position })}
                showDetails={!hideDetails}
                groupMode={groupMode}
                view={view}
                sections={sections.data ?? []}
              />
            ))}
          {tasks.hasNextPage && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void tasks.fetchNextPage()}
                disabled={tasks.isFetchingNextPage}
              >
                {tasks.isFetchingNextPage ? 'Loading...' : 'Load more tasks'}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Floating Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        tasks={sidebarTasks.data?.data ?? []}
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
      <UndoToast action={undoToast.current} onUndo={undoToast.handleUndo} onDismiss={undoToast.dismiss} />
    </>
  );
}

function GroupAndSortMenu({
  groupMode,
  sortMode,
  onGroupChange,
  onSortChange,
}: {
  groupMode: GroupMode;
  sortMode: SortMode;
  onGroupChange: (value: GroupMode) => void;
  onSortChange: (value: SortMode) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={groupMode === 'project' && sortMode === 'created-desc' ? 'ghost' : 'secondary'}
          size="icon"
          aria-label="Group and sort tasks"
        >
          <ListFilter className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Group & Sort</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Columns3 />
            Group by
            <span className="ml-auto mr-2 text-xs text-muted-foreground">{groupLabel(groupMode)}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup value={groupMode} onValueChange={(value) => onGroupChange(value as GroupMode)}>
              <DropdownMenuRadioItem value="project">Project</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="time">Time</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="tag">Tag</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="created">Created time</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="section">Section</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ListFilter />
            Sort by
            <span className="ml-auto mr-2 text-xs text-muted-foreground">{sortLabel(sortMode)}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => onSortChange(value as SortMode)}>
              <DropdownMenuRadioItem value="manual">Manual order</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="due">Due date</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="created-desc">Created newest</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="created-asc">Created oldest</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="modified-desc">Modified newest</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="modified-asc">Modified oldest</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="title">Title</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {(groupMode !== 'project' || sortMode !== 'created-desc') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onGroupChange('project');
                onSortChange('created-desc');
              }}
            >
              Restore defaults
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ViewOptionsMenu({
  displayMode,
  hideCompleted,
  hideDetails,
  onDisplayModeChange,
  onHideCompletedChange,
  onHideDetailsChange,
  onAddSection,
}: {
  displayMode: 'list' | 'kanban';
  hideCompleted: boolean;
  hideDetails: boolean;
  onDisplayModeChange: (value: 'list' | 'kanban') => void;
  onHideCompletedChange: (value: boolean) => void;
  onHideDetailsChange: (value: boolean) => void;
  onAddSection: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Task view options">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={displayMode}
          onValueChange={(value) => onDisplayModeChange(value as 'list' | 'kanban')}
          className="grid grid-cols-2 gap-1 p-1"
        >
          <DropdownMenuRadioItem value="list" className="justify-center rounded-md px-2 pl-7">
            <List className="mr-1" />
            List
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="kanban" className="justify-center rounded-md px-2 pl-7">
            <Columns3 className="mr-1" />
            Kanban
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={!hideCompleted} onCheckedChange={(value) => onHideCompletedChange(!value)}>
          <CheckSquare2 className="mr-2 h-4 w-4" />
          Show completed &amp; won't do
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={hideDetails} onCheckedChange={(value) => onHideDetailsChange(!!value)}>
          <EyeOff className="mr-2 h-4 w-4" />
          Hide row details
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAddSection}>
          <Plus />
          Add section
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.print()}>
          <Printer />
          Print current view
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskKanban({
  groups,
  allTasks,
  selectedTaskId,
  selectedTaskIds,
  onSelect,
  onToggleSelection,
  onContextMenu,
  showDetails,
  groupMode,
  view,
  sections,
}: {
  groups: Array<[string, ProductivityTask[]]>;
  allTasks: ProductivityTask[];
  selectedTaskId: string | null;
  selectedTaskIds?: ReadonlySet<string>;
  onSelect?: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  onContextMenu?: (task: ProductivityTask, position: { x: number; y: number }) => void;
  showDetails: boolean;
  groupMode: GroupMode;
  view: 'all' | 'today' | 'inbox' | 'upcoming';
  sections: TaskSection[];
}) {
  const queryClient = useQueryClient();
  const { push } = useUndoStack();
  const undoToast = useUndoToast();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [collapsedCompletedGroups, setCollapsedCompletedGroups] = useState<Record<string, boolean>>({});
  const boardGroups = kanbanGroups(groups, view, groupMode);
  const tasks = boardGroups.flatMap((group) => [...group.tasks, ...group.completedTasks]);

  const moveTask = useMutation({
    mutationFn: ({ taskId, targetGroup }: { taskId: string; targetGroup: string }) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) throw new Error('Task not found');
      const patch = groupMovePatch(groups, targetGroup, task, groupMode, view, sections);
      if (!Object.keys(patch).length) return Promise.resolve(task);
      return api.updateTask(taskId, { ...patch, version: task.version });
    },
    onSuccess: (_, { taskId, targetGroup }) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        const undoAction = {
          label: `Moved "${task.title.slice(0, 25)}" to ${targetGroup}`,
          undo: async () => {
            await api.updateTask(taskId, {
              status: task.status,
              priority: task.priority,
              sectionId: task.sectionId ?? null,
              taskListId: task.taskListId ?? null,
              dueAt: task.dueAt ?? null,
            });
          },
        };
        push(undoAction);
        undoToast.show(undoAction);
      }
    },
  });

  return (
    <>
      <div className="itu-kanban p-1">
        {boardGroups.map(({ title, tasks: items, completedTasks }) => {
          const completedCollapsed = collapsedCompletedGroups[title] ?? false;
          return (
            <section
              key={title}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId) {
                  moveTask.mutate({ taskId: draggedId, targetGroup: title });
                  setDraggedId(null);
                }
              }}
              className="flex flex-col rounded-xl border border-border/80 bg-card/60 p-3 min-h-[380px] shadow-sm transition-colors hover:border-border"
            >
              <div className="flex items-center justify-between pb-3 px-1 border-b border-border/60 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                  {items.length}
                </span>
              </div>

              <div className="flex-1">
                {items.length > 0 ? (
                  <TaskList
                    tasks={items}
                    allTasks={allTasks}
                    selectedTaskId={selectedTaskId}
                    selectedTaskIds={selectedTaskIds}
                    onSelect={onSelect}
                    onToggleSelection={onToggleSelection}
                    onContextMenu={onContextMenu}
                    compact
                    showDetails={showDetails}
                    showTaskList={groupMode !== 'project'}
                    draggable
                    onTaskDragStart={(id) => setDraggedId(id)}
                    onTaskDragEnd={() => setDraggedId(null)}
                    onUndoAction={undoToast.show}
                  />
                ) : null}
                {completedTasks.length > 0 ? (
                  <section className="mt-4 border-t border-border/60 pt-3">
                    <button
                      type="button"
                      className="mb-2 flex w-full items-center gap-1.5 px-1 text-left text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                      aria-expanded={!completedCollapsed}
                      onClick={() =>
                        setCollapsedCompletedGroups((current) => ({
                          ...current,
                          [title]: !completedCollapsed,
                        }))
                      }
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${completedCollapsed ? '-rotate-90' : ''}`}
                      />
                      <span>Completed &amp; Won&apos;t Do</span>
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {completedTasks.length}
                      </span>
                    </button>
                    {!completedCollapsed ? (
                      <TaskList
                        tasks={completedTasks}
                        allTasks={allTasks}
                        selectedTaskId={selectedTaskId}
                        selectedTaskIds={selectedTaskIds}
                        onSelect={onSelect}
                        onToggleSelection={onToggleSelection}
                        onContextMenu={onContextMenu}
                        compact
                        showDetails={showDetails}
                        showTaskList={groupMode !== 'project'}
                        onUndoAction={undoToast.show}
                      />
                    ) : null}
                  </section>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      <UndoToast action={undoToast.current} onUndo={undoToast.handleUndo} onDismiss={undoToast.dismiss} />
    </>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-5 p-1" aria-label="Loading tasks" aria-busy="true">
      {[3, 2].map((rows, groupIndex) => (
        <div key={groupIndex}>
          <div className="mb-3 h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="divide-y">
            {Array.from({ length: rows }, (_, rowIndex) => (
              <div key={rowIndex} className="flex gap-3 py-3">
                <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="itu-sidebar-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function InlineCreator({
  placeholder,
  value,
  onChange,
  onSubmit,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="itu-inline-creator"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Plus className="h-3.5 w-3.5" />
      <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </form>
  );
}

export type GroupMode = 'time' | 'project' | 'tag' | 'status' | 'priority' | 'created' | 'section' | 'none';
export type SortMode =
  | 'manual'
  | 'due'
  | 'priority'
  | 'created'
  | 'created-desc'
  | 'created-asc'
  | 'modified-desc'
  | 'modified-asc'
  | 'title';

export interface KanbanTaskGroup {
  title: string;
  tasks: ProductivityTask[];
  completedTasks: ProductivityTask[];
}

export function kanbanGroups(
  groups: Array<[string, ProductivityTask[]]>,
  view: 'all' | 'today' | 'inbox' | 'upcoming',
  mode: GroupMode,
): KanbanTaskGroup[] {
  const completed = groups.find(([title]) => title === "Completed & Won't Do")?.[1] ?? [];
  const boardGroups = groups
    .filter(([title]) => title !== "Completed & Won't Do")
    .map(([title, tasks]) => ({ title, tasks, completedTasks: [] as ProductivityTask[] }));

  if (mode === 'status') return boardGroups;

  for (const task of completed) {
    const title = taskGroupLabel(task, view, mode);
    let target = boardGroups.find((group) => group.title === title);
    if (!target) {
      target = { title, tasks: [], completedTasks: [] };
      boardGroups.push(target);
    }
    target.completedTasks.push(task);
  }
  return boardGroups;
}

export function groupTasks(
  tasks: ProductivityTask[],
  view: 'all' | 'today' | 'inbox' | 'upcoming',
  mode: GroupMode,
  sections: TaskSection[],
) {
  const rootTasks = tasks.filter((task) => !task.parentId);
  const active = rootTasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELED');
  const completed = rootTasks.filter((task) => task.status === 'COMPLETED' || task.status === 'CANCELED');
  const groups = new Map<string, ProductivityTask[]>();
  if (mode === 'section') {
    for (const section of sections) groups.set(section.title, []);
  }
  if (mode === 'priority') {
    for (const priority of ['High priority', 'Medium priority', 'Low priority', 'No priority'])
      groups.set(priority, []);
  }
  for (const task of active) {
    const key = taskGroupLabel(task, view, mode);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  if (completed.length) groups.set("Completed & Won't Do", completed);
  return [...groups.entries()];
}

function taskGroupLabel(task: ProductivityTask, view: 'all' | 'today' | 'inbox' | 'upcoming', mode: GroupMode) {
  if (mode === 'none') return 'Tasks';
  if (mode === 'time') return timeGroupLabel(task.scheduledStartAt ?? task.dueAt);
  if (mode === 'status') return statusLabel(task.status);
  if (mode === 'priority') return priorityLabel(task.priority);
  if (mode === 'tag') return task.tags?.[0]?.tag?.name ? `#${task.tags[0].tag.name}` : 'No tag';
  if (mode === 'created') return createdGroupLabel(task.createdAt);
  if (mode === 'section') return task.section?.title ?? 'No section';
  if (view === 'upcoming') {
    return new Date(task.scheduledStartAt ?? task.dueAt ?? Date.now()).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }
  return (task.taskList ?? task.project)?.title ?? 'Inbox';
}

export function sortTasks(tasks: ProductivityTask[], mode: SortMode) {
  if (mode === 'manual') {
    return [...tasks].sort((left, right) => {
      const order = left.sortOrder - right.sortOrder;
      if (order !== 0) return order;
      const created = nullableTime(left.createdAt) - nullableTime(right.createdAt);
      if (created !== 0) return created;
      return left.id.localeCompare(right.id);
    });
  }
  const originalIndexById = new Map(tasks.map((task, index) => [task.id, index]));
  const preserveOriginalOrder = (left: ProductivityTask, right: ProductivityTask) =>
    (originalIndexById.get(left.id) ?? 0) - (originalIndexById.get(right.id) ?? 0);
  return [...tasks].sort((left, right) => {
    if (mode === 'created' || mode === 'created-desc') {
      const created = nullableTime(right.createdAt) - nullableTime(left.createdAt);
      if (created !== 0) return created;
      return preserveOriginalOrder(left, right);
    }
    if (mode === 'created-asc') {
      const created = nullableTime(left.createdAt) - nullableTime(right.createdAt);
      if (created !== 0) return created;
      return preserveOriginalOrder(left, right);
    }
    if (mode === 'modified-desc') {
      const modified = nullableTime(right.updatedAt) - nullableTime(left.updatedAt);
      if (modified !== 0) return modified;
      return preserveOriginalOrder(left, right);
    }
    if (mode === 'modified-asc') {
      const modified = nullableTime(left.updatedAt) - nullableTime(right.updatedAt);
      if (modified !== 0) return modified;
      return preserveOriginalOrder(left, right);
    }
    if (mode === 'due') {
      const leftTime = dueSortTime(left);
      const rightTime = dueSortTime(right);
      if (leftTime !== rightTime) return leftTime - rightTime;
      const leftAllDay = isAllDayDue(left.dueAt) ? 1 : 0;
      const rightAllDay = isAllDayDue(right.dueAt) ? 1 : 0;
      if (leftAllDay !== rightAllDay) return leftAllDay - rightAllDay;
      return leftTime - rightTime;
    }
    if (mode === 'title') return left.title.localeCompare(right.title);
    const priority: Record<TaskPriority, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
    return priority[right.priority] - priority[left.priority];
  });
}

export function groupLabel(mode: GroupMode) {
  return {
    time: 'Time',
    project: 'List',
    tag: 'Tag',
    status: 'Status',
    priority: 'Priority',
    created: 'Created',
    section: 'Section',
    none: 'None',
  }[mode];
}

export function sortLabel(mode: SortMode) {
  return {
    manual: 'Manual order',
    due: 'Due date',
    priority: 'Priority',
    created: 'Created newest',
    'created-desc': 'Created newest',
    'created-asc': 'Created oldest',
    'modified-desc': 'Modified newest',
    'modified-asc': 'Modified oldest',
    title: 'Title',
  }[mode];
}

function dueSortTime(task: ProductivityTask) {
  const value = task.dueAt ?? task.scheduledStartAt;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function isAllDayDue(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

function timeGroupLabel(value: string | null | undefined) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No date';
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(date);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return 'Next 7 Days';
  return 'Later';
}

function createdGroupLabel(value: string | null | undefined) {
  if (!value) return 'Unknown created time';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown created time';
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Created today';
  if (diffDays === 1) return 'Created yesterday';
  if (diffDays <= 7) return 'Created last 7 days';
  if (diffDays <= 30) return 'Created last 30 days';
  return 'Created earlier';
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nullableTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function reorderedTaskIds(
  groups: Array<[string, ProductivityTask[]]>,
  taskId: string,
  targetGroup: string,
  beforeTaskId?: string,
) {
  const next = groups.map(([group, tasks]) => [group, tasks.filter((task) => task.id !== taskId)] as const);
  const target = next.find(([group]) => group === targetGroup);
  if (!target) return groups.flatMap(([, tasks]) => tasks.map((task) => task.id));
  const dragged = groups.flatMap(([, tasks]) => tasks).find((task) => task.id === taskId);
  if (!dragged) return groups.flatMap(([, tasks]) => tasks.map((task) => task.id));
  const index = beforeTaskId ? target[1].findIndex((task) => task.id === beforeTaskId) : -1;
  target[1].splice(index < 0 ? target[1].length : index, 0, dragged);
  return next.flatMap(([, tasks]) => tasks.map((task) => task.id));
}

export function applyManualTaskOrder(
  tasks: ProductivityTask[],
  orderedTaskIds: string[],
  movedTaskId: string,
  patch: Partial<TaskInput> = {},
) {
  const sortOrderById = new Map(orderedTaskIds.map((id, index) => [id, index + 1]));
  return tasks.map((task) => {
    const nextSortOrder = sortOrderById.get(task.id);
    if (nextSortOrder === undefined && task.id !== movedTaskId) return task;
    return {
      ...task,
      ...(task.id === movedTaskId ? patch : {}),
      sortOrder: nextSortOrder ?? task.sortOrder,
    };
  });
}

export function manualMoveBeforeTaskId(
  tasks: ReadonlyArray<Pick<ProductivityTask, 'id'>>,
  taskId: string,
  direction: 'up' | 'down',
) {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return taskId;
  if (direction === 'up') return tasks[index - 1]?.id ?? taskId;
  if (index >= tasks.length - 1) return taskId;
  return tasks[index + 2]?.id;
}

function groupMovePatch(
  groups: Array<[string, ProductivityTask[]]>,
  targetGroup: string,
  dragged: ProductivityTask,
  mode: GroupMode,
  view: 'all' | 'today' | 'inbox' | 'upcoming',
  sections: TaskSection[],
): Partial<TaskInput> {
  const targetTasks = groups.find(([group]) => group === targetGroup)?.[1] ?? [];
  const example = targetTasks.find((task) => task.id !== dragged.id);
  if (targetGroup === "Completed & Won't Do") return { status: 'COMPLETED' };

  const reopen = dragged.status === 'COMPLETED' || dragged.status === 'CANCELED';
  const status = reopen ? (example?.status === 'INBOX' ? 'INBOX' : 'PLANNED') : undefined;
  if (mode === 'status' && example) return { status: example.status };
  if (mode === 'priority' && example) return { priority: example.priority, status };
  if (mode === 'time' && example) {
    const targetDate = example.dueAt ?? example.scheduledStartAt;
    return targetDate ? { dueAt: targetDate, status } : { dueAt: null, status };
  }
  if (mode === 'section') {
    const section = sections.find((item) => item.title === targetGroup);
    return { sectionId: section?.id ?? null, projectId: section?.projectId ?? dragged.projectId ?? null, status };
  }
  if (mode === 'project') {
    if (view === 'upcoming' && example) {
      const targetDate = example.scheduledStartAt ?? example.dueAt;
      return targetDate ? { scheduledStartAt: targetDate, status } : { status };
    }
    return {
      projectId: example?.projectId ?? null,
      status: status ?? (example?.status === 'INBOX' ? 'INBOX' : undefined),
    };
  }
  return status ? { status } : {};
}

function statusLabel(status: ProductivityTask['status']) {
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function priorityLabel(priority: TaskPriority) {
  return priority === 'NONE' ? 'No priority' : `${priority[0]}${priority.slice(1).toLowerCase()} priority`;
}

/**
 * Returns true if the task qualifies for the Inbox view: it is unassigned or stored
 * in the default Inbox list, and is in a terminal or unscheduled Inbox state.
 */
export function isInboxViewTask(task: ProductivityTask, inboxListId?: string | null): boolean {
  const taskListId = task.taskListId ?? task.projectId;
  const isInboxList = !taskListId || taskListId === inboxListId;
  const isTerminalOrUnassigned =
    task.status === 'COMPLETED' ||
    task.status === 'CANCELED' ||
    (task.status === 'INBOX' && !task.scheduledStartAt);
  return isInboxList && isTerminalOrUnassigned;
}

export function countInbox(tasks: ProductivityTask[]) {
  return tasks.filter(
    (task) => task.status === 'INBOX' && !(task.taskListId ?? task.projectId) && !task.scheduledStartAt,
  ).length;
}

export function countToday(tasks: ProductivityTask[]) {
  const today = new Date().toDateString();
  return tasks.filter((task) => {
    const date = task.scheduledStartAt ?? task.dueAt;
    return date && new Date(date).toDateString() === today;
  }).length;
}

function isNextSevenDays(task: ProductivityTask) {
  const value = task.scheduledStartAt ?? task.dueAt;
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= Date.now() && time <= Date.now() + 7 * 86_400_000;
}

function projectColor(color: string) {
  const colors: Record<string, string> = {
    TEAL: '#0f766e',
    BLUE: '#2563eb',
    VIOLET: '#7c3aed',
    ROSE: '#e11d48',
    AMBER: '#d97706',
    EMERALD: '#059669',
  };
  return colors[color] ?? '#64748b';
}

function tagColor(color: string) {
  return projectColor(color);
}
