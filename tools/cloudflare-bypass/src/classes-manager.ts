/**
 * classes-manager.ts
 *
 * Manages local persistence and caching of TalkFirst schedule data in `classes.json`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CachedWeekRecord, ClassesCacheStore, ClassSlot, WeekScheduleData } from './types.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const CLASSES_FILE = resolve(currentDir, '../classes.json');

/**
 * Extracts unique class slots across all cached weeks keyed by class ID.
 */
function aggregateUniqueClasses(weeks: Record<string, CachedWeekRecord>): ClassSlot[] {
  const classMap = new Map<string, ClassSlot>();
  for (const week of Object.values(weeks)) {
    for (const slot of week.flexibleClasses || []) {
      if (slot?.id) {
        classMap.set(slot.id, slot);
      }
    }
  }
  return Array.from(classMap.values());
}

/**
 * Loads the stored classes data from classes.json.
 */
export function loadClassesData(): ClassesCacheStore {
  if (!existsSync(CLASSES_FILE)) {
    return { updatedAt: null, weeks: {}, allClasses: [] };
  }

  try {
    const raw = readFileSync(CLASSES_FILE, 'utf-8');
    const data = JSON.parse(raw) as Partial<ClassesCacheStore>;
    return {
      updatedAt: data.updatedAt || null,
      weeks: data.weeks || {},
      allClasses: Array.isArray(data.allClasses) ? data.allClasses : [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[classes-manager] Failed to read classes.json:', message);
    return { updatedAt: null, weeks: {}, allClasses: [] };
  }
}

/**
 * Checks if classes.json exists and contains cached class data.
 */
export function hasCachedClasses(): boolean {
  const data = loadClassesData();
  return Boolean(data.allClasses && data.allClasses.length > 0);
}

/**
 * Gets cached schedule for a specific Monday anchor date.
 */
export function getCachedWeekSchedule(mondayStr: string): CachedWeekRecord | null {
  const data = loadClassesData();
  return data.weeks[mondayStr] || null;
}

/**
 * Builds a standard CachedWeekRecord from schedule data.
 */
function createCachedWeekRecord(monday: string, scheduleData: WeekScheduleData): CachedWeekRecord {
  return {
    monday,
    startDate: scheduleData.startDate,
    endDate: scheduleData.endDate,
    summary: scheduleData.summary || [],
    canBooking: Boolean(scheduleData.canBooking),
    flexibleClasses: scheduleData.flexibleClasses || [],
    fixedClasses: scheduleData.fixedClasses || [],
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Saves a single week schedule into classes.json.
 */
export function saveWeekSchedule(mondayStr: string, scheduleData: WeekScheduleData): ClassesCacheStore {
  const current = loadClassesData();
  current.weeks[mondayStr] = createCachedWeekRecord(mondayStr, scheduleData);
  current.updatedAt = new Date().toISOString();
  current.allClasses = aggregateUniqueClasses(current.weeks);

  writeFileSync(CLASSES_FILE, JSON.stringify(current, null, 2), 'utf-8');
  return current;
}

/**
 * Saves multiple week schedules into classes.json at once.
 */
export function saveMultipleWeekSchedules(
  schedules: Array<{ monday: string; schedule: WeekScheduleData }>
): ClassesCacheStore {
  const current = loadClassesData();

  for (const { monday, schedule } of schedules) {
    if (!monday || !schedule) {
      continue;
    }
    current.weeks[monday] = createCachedWeekRecord(monday, schedule);
  }

  current.updatedAt = new Date().toISOString();
  current.allClasses = aggregateUniqueClasses(current.weeks);

  writeFileSync(CLASSES_FILE, JSON.stringify(current, null, 2), 'utf-8');
  console.log(
    `💾 [classes-manager] Saved ${current.allClasses.length} class slot(s) across ${Object.keys(current.weeks).length} week(s) to classes.json`
  );
  return current;
}
