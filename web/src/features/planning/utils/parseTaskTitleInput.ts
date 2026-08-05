import { PRIORITY_PATTERNS, DUEDATE_PATTERNS } from '@/shared/constants/task-parser.constants';
import type { TaskPriority } from '@/shared/api/types';

export interface ParsedTaskInput {
  cleanTitle: string;
  priority?: TaskPriority;
  dueAtDateString?: string;
}

/**
 * Parses inline shortcuts from task title inputs:
 * - Priority: !high / !p1 -> HIGH, !med / !p2 -> MEDIUM, !low / !p3 -> LOW
 * - Due date: due:today / #today -> Today YYYY-MM-DD, due:tomorrow / #tomorrow -> Tomorrow YYYY-MM-DD
 */
export function parseTaskTitleInput(input: string): ParsedTaskInput {
  let title = input;
  let priority: TaskPriority | undefined;
  let dueAtDateString: string | undefined;

  const now = new Date();

  // Priority shortcuts (!high, !med, !low, !p1, !p2, !p3)
  for (const pattern of PRIORITY_PATTERNS) {
    if (pattern.regex.test(title)) {
      priority = pattern.priority;
      title = title.replace(pattern.cleanup, '');
      break;
    }
  }

  // Due date shortcuts (due:today, #today, due:tomorrow, #tomorrow)
  for (const pattern of DUEDATE_PATTERNS) {
    if (pattern.regex.test(title)) {
      dueAtDateString = pattern.getDateString(now);
      title = title.replace(pattern.cleanup, '');
      break;
    }
  }

  return {
    cleanTitle: title.replace(/\s+/g, ' ').trim(),
    priority,
    dueAtDateString,
  };
}
