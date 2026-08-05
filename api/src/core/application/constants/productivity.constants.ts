/* ─── Task View Filters ─── */
export const TASK_VIEW_FILTERS = {
  TODAY: 'today',
  INBOX: 'inbox',
  ALL: 'all',
} as const;

export type TaskViewFilter = (typeof TASK_VIEW_FILTERS)[keyof typeof TASK_VIEW_FILTERS];

/* ─── Focus Session Status ─── */
export const FocusSessionStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
} as const;

export type FocusSessionStatusValue = (typeof FocusSessionStatus)[keyof typeof FocusSessionStatus];

/* ─── Eisenhower Matrix Quadrants ─── */
export const EISENHOWER = {
  DO_FIRST: 'doFirst',
  SCHEDULE: 'schedule',
  DELEGATE: 'delegate',
  DONT_DO: 'dontDo',
} as const;

export type EisenhowerQuadrant = (typeof EISENHOWER)[keyof typeof EISENHOWER];

/* ─── Onboarding State ─── */
export const ONBOARDING_STATE = {
  NOT_STARTED: 'NOT_STARTED',
  COMPLETED: 'COMPLETED',
} as const;

export type OnboardingStateValue = (typeof ONBOARDING_STATE)[keyof typeof ONBOARDING_STATE];

/* ─── Habit Occurrence Source ─── */
export const HABIT_SOURCE = {
  TASK_COMPLETION: 'TASK_COMPLETION',
  DIRECT_CHECK_IN: 'DIRECT_CHECK_IN',
} as const;

/* ─── Reminder Actions ─── */
export const REMINDER_ACTION = {
  SNOOZE: 'snooze',
  DISMISS: 'dismiss',
} as const;

export type ReminderAction = (typeof REMINDER_ACTION)[keyof typeof REMINDER_ACTION];

/* ─── Habit Occurrence Actions ─── */
export const HABIT_OCCURRENCE_ACTION = {
  SKIP: 'skip',
  FAIL: 'fail',
  UNDO: 'undo',
} as const;

export type HabitOccurrenceAction = (typeof HABIT_OCCURRENCE_ACTION)[keyof typeof HABIT_OCCURRENCE_ACTION];
