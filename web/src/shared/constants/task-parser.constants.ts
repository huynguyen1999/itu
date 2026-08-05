import type { TaskPriority } from '@/shared/api/types';

/* ─── Priority Pattern Definitions ─── */
export interface PriorityPattern {
  regex: RegExp;
  priority: TaskPriority;
  cleanup: RegExp;
}

export const PRIORITY_PATTERNS: PriorityPattern[] = [
  {
    regex: /(?:^|\s)!high\b|(?:^|\s)!p1\b/i,
    priority: 'HIGH',
    cleanup: /(?:^|\s)!high\b|(?:^|\s)!p1\b/gi,
  },
  {
    regex: /(?:^|\s)!med(?:ium)?\b|(?:^|\s)!p2\b/i,
    priority: 'MEDIUM',
    cleanup: /(?:^|\s)!med(?:ium)?\b|(?:^|\s)!p2\b/gi,
  },
  {
    regex: /(?:^|\s)!low\b|(?:^|\s)!p3\b/i,
    priority: 'LOW',
    cleanup: /(?:^|\s)!low\b|(?:^|\s)!p3\b/gi,
  },
] as const;

/* ─── Due Date Pattern Definitions ─── */
export interface DueDatePattern {
  regex: RegExp;
  getDateString: (now: Date) => string;
  cleanup: RegExp;
}

export const DUEDATE_PATTERNS: DueDatePattern[] = [
  {
    regex: /(?:^|\s)due:today\b|(?:^|\s)#today\b/i,
    getDateString: (now: Date) => now.toISOString().slice(0, 10),
    cleanup: /(?:^|\s)due:today\b|(?:^|\s)#today\b/gi,
  },
  {
    regex: /(?:^|\s)due:tomorrow\b|(?:^|\s)#tomorrow\b/i,
    getDateString: (now: Date) => {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().slice(0, 10);
    },
    cleanup: /(?:^|\s)due:tomorrow\b|(?:^|\s)#tomorrow\b/gi,
  },
] as const;
