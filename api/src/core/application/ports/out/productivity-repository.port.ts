export interface IProductivityRepository {
  recordSyncChange(
    userId: string,
    entityType: string,
    entityId: string,
    operation: 'UPSERT' | 'DELETE',
    data: object,
  ): Promise<{ cursor: bigint | number | string }>;

  // Task Lists & Sections
  listTaskLists(userId: string, filter?: any): Promise<any[]>;
  findTaskListById(userId: string, id: string): Promise<any | null>;
  createTaskList(userId: string, data: any): Promise<any>;
  updateTaskList(userId: string, id: string, data: any): Promise<any | null>;
  deleteTaskList(userId: string, id: string): Promise<boolean>;

  listSections(userId: string, taskListId?: string, filter?: any): Promise<any[]>;
  createSection(userId: string, data: any): Promise<any>;
  updateSection(userId: string, id: string, data: any): Promise<any | null>;
  deleteSection(userId: string, id: string): Promise<boolean>;

  // Tasks
  listTasks(userId: string, filter?: any): Promise<{ data: any[]; hasNextPage: boolean; nextCursor: string | null }>;
  findTaskById(userId: string, id: string): Promise<any | null>;
  createTask(userId: string, data: any): Promise<any>;
  updateTask(userId: string, id: string, data: any): Promise<any | null>;
  deleteTask(userId: string, id: string): Promise<boolean>;
  restoreTask(userId: string, id: string): Promise<any | null>;
  reorderTasks(userId: string, taskIds: string[]): Promise<any>;
  createReminder(userId: string, taskId: string, data: any): Promise<any>;
  updateReminder(userId: string, id: string, data: any): Promise<any>;
  reminderAction(userId: string, id: string, action: 'snooze' | 'dismiss', remindAt?: string): Promise<any>;

  // Focus Presets, Sessions & Time Blocks
  listFocusPresets(userId: string): Promise<any[]>;
  findFocusPresetById(userId: string, id: string): Promise<any | null>;
  createFocusPreset(userId: string, data: any): Promise<any>;
  updateFocusPreset(userId: string, id: string, data: any): Promise<any | null>;
  deleteFocusPreset(userId: string, id: string): Promise<boolean>;

  listFocusSessions(userId: string, filter?: any): Promise<any[]>;
  findFocusSessionById(userId: string, id: string): Promise<any | null>;
  findActiveFocusSession(userId: string): Promise<any | null>;
  createFocusSession(userId: string, data: any): Promise<any>;
  updateFocusSession(userId: string, id: string, data: any): Promise<any | null>;
  focusAction(userId: string, id: string, action: string, data?: any): Promise<any>;
  adjustFocus(
    userId: string,
    id: string,
    startedAt?: string,
    completedAt?: string,
    taskId?: string,
    expectedVersion?: number,
    idempotencyKey?: string,
  ): Promise<any>;
  listFocusSounds(userId: string): Promise<any[]>;
  findFocusSoundById(userId: string, id: string): Promise<any | null>;
  findFocusSoundByStorageKey(userId: string, storageKey: string): Promise<any | null>;
  createFocusSound(userId: string, data: any): Promise<any>;
  updateFocusSound(userId: string, id: string, data: any): Promise<any | null>;
  deleteFocusSound(userId: string, id: string): Promise<any | null>;
  listFocusSoundPreferences(userId: string): Promise<any[]>;
  upsertFocusSoundPreference(userId: string, soundKey: string, data: any): Promise<any>;

  listTimeBlocks(userId: string): Promise<any[]>;
  createTimeBlock(userId: string, data: any): Promise<any>;
  updateTimeBlock(userId: string, id: string, data: any): Promise<any | null>;
  deleteTimeBlock(userId: string, id: string): Promise<boolean>;

  // Habits & Occurrences
  listHabits(userId: string, includeArchived?: boolean): Promise<any[]>;
  findHabitById(userId: string, id: string): Promise<any | null>;
  createHabit(userId: string, data: any): Promise<any>;
  updateHabit(userId: string, id: string, data: any): Promise<any | null>;
  deleteHabit(userId: string, id: string): Promise<boolean>;

  listHabitOccurrences(userId: string, filter?: any): Promise<any[]>;
  listHabitCalendar(userId: string, filter: { from: string; to: string; habitId?: string }): Promise<any>;
  findHabitOccurrenceById(userId: string, id: string): Promise<any | null>;
  upsertHabitOccurrence(userId: string, data: any): Promise<any>;
  getHabitCommitmentPolicy(userId: string, habitId: string): Promise<any | null>;
  upsertHabitCommitmentPolicy(userId: string, habitId: string, data: any): Promise<any>;
  evaluateHabitCommitment(userId: string, occurrenceId: string, now?: Date, idempotencyKey?: string): Promise<any>;
  excuseHabitCommitment(userId: string, occurrenceId: string, idempotencyKey?: string): Promise<any>;
  checkIn(userId: string, occurrenceId: string, data: any): Promise<any>;
  checkInByDate(userId: string, habitId: string, localDate: string, data: any): Promise<any>;
  habitOccurrenceActionByDate(
    userId: string,
    habitId: string,
    localDate: string,
    action: 'skip' | 'fail' | 'undo',
    idempotencyKey?: string,
  ): Promise<any>;
  listHabitProgress(userId: string, habitId: string, filter?: { from?: string; to?: string }): Promise<any[]>;
  deleteHabitProgress(userId: string, progressId: string): Promise<any | null>;
  habitOccurrenceAction(
    userId: string,
    id: string,
    action: 'skip' | 'fail' | 'undo',
    idempotencyKey?: string,
  ): Promise<any>;
  updateChecklistItem(userId: string, id: string, data: any): Promise<any>;
  setOccurrenceChecklistItem(userId: string, occurrenceId: string, itemId: string, completed: boolean): Promise<any>;
  habitStats(userId: string, habitId: string): Promise<any>;
  habitInsights(userId: string, habitId: string, filter: { from: string; to: string }): Promise<any>;
  habitReminderAction(userId: string, deliveryId: string, action: 'snooze' | 'dismiss' | 'complete', remindAt?: string): Promise<any>;
  listHabitStats(userId: string, habitIds: string[]): Promise<Record<string, any>>;

  // Task Tags & Notifications
  listTaskTags(userId: string): Promise<any[]>;
  createTaskTag(userId: string, data: any): Promise<any>;

  listNotifications(userId: string, filter?: any): Promise<any[]>;
  markAllNotificationsRead(userId: string): Promise<boolean>;
  markNotificationRead(userId: string, id: string): Promise<boolean>;
}
