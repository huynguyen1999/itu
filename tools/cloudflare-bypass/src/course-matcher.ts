/**
 * course-matcher.ts
 *
 * Course criteria matching, constraint verification, and registration planning engine for TalkFirst.
 * Prioritizes guard clauses, decomposed matchers, and strict type safety.
 */

import { saveMultipleWeekSchedules } from './classes-manager.ts';
import {
  DAY_ALIASES,
  DAY_NAMES_TITLE,
  DAYS_OF_WEEK,
  REGISTRATION_STATUS,
  WEEK_MODES,
} from './constants.ts';
import type { TalkFirstApiClient } from './api-client.ts';
import type {
  ClassSlot,
  CourseCriteria,
  CoursePlanningResult,
  MultiWeekScheduleResult,
  QuotaTracker,
  RegistrationPlanItem,
  TargetWeekOptions,
  TargetWeeksResult,
  WeekSummaryItem,
} from './types.ts';

// ── Text & Date Utilities ───────────────────────────────────────────────────

export function normalize(text: unknown): string {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text).toLowerCase().trim();
}

export function timeToMinutes(timeStr: string | null | undefined): number {
  if (!timeStr) {
    return 0;
  }
  const parts = timeStr.split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

export function hasTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  return timeToMinutes(start1) < timeToMinutes(end2) && timeToMinutes(start2) < timeToMinutes(end1);
}

export function formatLocalDate(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMondayOfWeek(dateInput?: string | Date | null): string {
  let d: Date;
  if (!dateInput) {
    d = new Date();
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, day] = dateInput.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(dateInput);
  }

  const dayIndex = d.getDay();
  const distance = (dayIndex === 0 ? -6 : 1) - dayIndex;
  d.setDate(d.getDate() + distance);
  return formatLocalDate(d);
}

export function getSundayOfWeek(mondayStr: string): string {
  const [y, m, day] = mondayStr.split('-').map(Number);
  return formatLocalDate(new Date(y, m - 1, day + 6));
}

export function resolveTargetWeeks(options: TargetWeekOptions = {}, anchorDate = new Date()): TargetWeeksResult {
  if (options.date) {
    const monday = getMondayOfWeek(options.date);
    return {
      weekMode: WEEK_MODES.CUSTOM,
      weekLabel: `Custom Date (${options.date}, week of ${monday})`,
      mondays: [monday],
      primaryMonday: monday,
    };
  }

  const raw = String(
    options.week ||
      options.weekType ||
      (options.thisWeek ? 'this' : '') ||
      (options.nextWeek ? 'next' : '') ||
      (options.allWeeks ? 'all' : '') ||
      'next'
  )
    .toLowerCase()
    .trim();

  const thisMonday = getMondayOfWeek(anchorDate);
  const [ty, tm, td] = thisMonday.split('-').map(Number);
  const nextMonday = formatLocalDate(new Date(ty, tm - 1, td + 7));

  if (raw === 'this' || raw === 'current' || raw === 'this-week') {
    return {
      weekMode: WEEK_MODES.THIS,
      weekLabel: `This Week (${thisMonday} to ${getSundayOfWeek(thisMonday)})`,
      mondays: [thisMonday],
      primaryMonday: thisMonday,
    };
  }

  if (raw === 'all' || raw === 'both' || raw === 'all-weeks') {
    return {
      weekMode: WEEK_MODES.ALL,
      weekLabel: `All Weeks (${thisMonday} to ${getSundayOfWeek(nextMonday)})`,
      mondays: [thisMonday, nextMonday],
      primaryMonday: nextMonday,
    };
  }

  return {
    weekMode: WEEK_MODES.NEXT,
    weekLabel: `Next Week (${nextMonday} to ${getSundayOfWeek(nextMonday)})`,
    mondays: [nextMonday],
    primaryMonday: nextMonday,
  };
}

export function matchesDateOrDay(classDate: string, targetDateOrDay?: string): boolean {
  if (!targetDateOrDay) {
    return true;
  }
  const targetNorm = normalize(targetDateOrDay);
  const classNorm = normalize(classDate);

  if (classNorm === targetNorm || classNorm.endsWith(targetNorm)) {
    return true;
  }

  const dateObj = new Date(classDate);
  if (!isNaN(dateObj.getTime())) {
    const dayName = DAYS_OF_WEEK[dateObj.getDay()];
    const resolved = DAY_ALIASES[targetNorm] || targetNorm;
    return dayName === resolved;
  }
  return false;
}

// ── Criteria Matching Guard Functions ───────────────────────────────────────

function matchesIdCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  if (criteria.id && slot.id !== criteria.id) {
    return false;
  }
  if (criteria.timeSlot && slot.timeSlot && slot.timeSlot !== criteria.timeSlot) {
    return false;
  }
  if (criteria.programClassId && slot.programClassId && slot.programClassId !== criteria.programClassId) {
    return false;
  }
  return true;
}

function matchesLessonCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  if (!criteria.lesson) {
    return true;
  }
  const target = normalize(criteria.lesson);
  const itemLesson = normalize(slot.lesson || slot.lessonInfo?.lesson);
  return itemLesson.includes(target);
}

function matchesTypeCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  if (!criteria.type && !criteria.subClassType) {
    return true;
  }
  const rawTarget =
    typeof criteria.subClassType === 'object' && criteria.subClassType !== null
      ? criteria.subClassType.name
      : criteria.type || criteria.subClassType;
  const target = normalize(rawTarget);
  const itemType = normalize(typeof slot.subClassType === 'object' ? slot.subClassType?.name : slot.subClassType);
  return !target || itemType.includes(target);
}

function matchesTeacherCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  const teacherQuery = criteria.teacher || criteria.teacherName || criteria.teacherNickName;
  if (!teacherQuery) {
    return true;
  }
  const target = normalize(teacherQuery);
  const fullName = normalize(slot.teacherName);
  const nickName = normalize(slot.teacherNickName);
  return fullName.includes(target) || nickName.includes(target);
}

function matchesDateCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  const dateQuery = criteria.date || criteria.day || criteria.dayOfWeek;
  if (!dateQuery) {
    return true;
  }
  return matchesDateOrDay(slot.date, dateQuery);
}

function matchesTimeCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  const timeQuery = criteria.time || criteria.startTime;
  if (!timeQuery) {
    return true;
  }
  const target = normalize(timeQuery).replace('h', ':');
  const itemStart = normalize(slot.startTime);
  return itemStart.startsWith(target.slice(0, 5)) || itemStart.includes(target);
}

function matchesRoomCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  if (!criteria.room) {
    return true;
  }
  return normalize(slot.room).includes(normalize(criteria.room));
}

/**
 * Checks whether a class slot satisfies all given criteria.
 */
export function matchesCriteria(slot: ClassSlot, criteria: CourseCriteria): boolean {
  if (!criteria || Object.keys(criteria).length === 0) {
    return true;
  }

  if (!matchesIdCriteria(slot, criteria)) return false;
  if (!matchesLessonCriteria(slot, criteria)) return false;
  if (!matchesTypeCriteria(slot, criteria)) return false;
  if (!matchesTeacherCriteria(slot, criteria)) return false;
  if (!matchesDateCriteria(slot, criteria)) return false;
  if (!matchesTimeCriteria(slot, criteria)) return false;
  if (!matchesRoomCriteria(slot, criteria)) return false;

  return true;
}

export function filterClasses(classes: ClassSlot[], criteria: CourseCriteria): ClassSlot[] {
  return (classes || []).filter((item) => matchesCriteria(item, criteria));
}

// ── Schedule Logging ────────────────────────────────────────────────────────

export function logFetchedClasses(classes: ClassSlot[]): void {
  if (!classes || classes.length === 0) {
    console.log('   ⚠️  No class slots found for the selected period.\n');
    return;
  }

  const sorted = [...classes].sort((a, b) => {
    if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  const byDate = new Map<string, ClassSlot[]>();
  for (const c of sorted) {
    const key = c.date || 'Unknown Date';
    if (!byDate.has(key)) {
      byDate.set(key, []);
    }
    byDate.get(key)!.push(c);
  }

  console.log(`   📅 Fetched ${sorted.length} class slot(s):`);

  for (const [dateStr, dayClasses] of byDate.entries()) {
    let header = dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, day] = dateStr.split('-').map(Number);
      const d = new Date(y, m - 1, day);
      const dayName = isNaN(d.getTime()) ? '' : DAY_NAMES_TITLE[d.getDay()];
      header = dayName ? `${dayName}, ${dateStr}` : dateStr;
    }

    console.log(`   ── ${header} (${dayClasses.length} classes) ──`);
    for (const c of dayClasses) {
      const timeStr =
        c.startTime && c.endTime
          ? `${c.startTime.slice(0, 5)} - ${c.endTime.slice(0, 5)}`
          : c.startTime?.slice(0, 5) || 'N/A';
      const teacher = c.teacherNickName || c.teacherName || 'N/A';
      const room = c.room || 'N/A';
      const lesson = c.lesson || c.lessonInfo?.lesson || 'Untitled Lesson';
      const statusBadge = c.hasEnrolled ? ' [📌 ENROLLED]' : ` [${c.currentStudents ?? 0}/${c.maxStudents ?? 0}]`;
      console.log(`      • ${timeStr} | "${lesson}" | Teacher: ${teacher} | Room: ${room}${statusBadge}`);
    }
  }
  console.log('');
}

// ── Multi-Week Schedule Fetcher ─────────────────────────────────────────────

export async function fetchMultiWeekSchedule(
  client: TalkFirstApiClient,
  requestedCourses: CourseCriteria[] = [],
  options: TargetWeekOptions = {}
): Promise<MultiWeekScheduleResult> {
  const target = resolveTargetWeeks(options);
  const datesToFetch = new Set<string>(target.mondays);

  if (target.weekMode === WEEK_MODES.ALL) {
    for (const course of requestedCourses) {
      if (course.date && /^\d{4}-\d{2}-\d{2}$/.test(course.date)) {
        datesToFetch.add(getMondayOfWeek(course.date));
      }
    }
  }

  const classMap = new Map<string, ClassSlot>();
  const enrolledMap = new Map<string, ClassSlot>();
  const summariesByWeek = new Map<string, WeekSummaryItem[]>();
  const fetchedSchedules: Array<{ monday: string; schedule: any }> = [];
  let canBooking = false;

  for (const mondayStr of datesToFetch) {
    try {
      const schedule = await client.fetchSchedule({ date: mondayStr, weekType: 'current' });
      if (schedule.canBooking) canBooking = true;
      if (Array.isArray(schedule.summary)) summariesByWeek.set(mondayStr, schedule.summary);
      fetchedSchedules.push({ monday: mondayStr, schedule });

      for (const slot of schedule.flexibleClasses || []) {
        classMap.set(slot.id, slot);
        if (slot.hasEnrolled) enrolledMap.set(slot.id, slot);
      }
      for (const slot of schedule.fixedClasses || []) {
        if (slot.hasEnrolled) enrolledMap.set(slot.id, slot);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[course-matcher] Could not fetch schedule for week of ${mondayStr}:`, message);
    }
  }

  const allFlexibleClasses = Array.from(classMap.values());
  logFetchedClasses(allFlexibleClasses);

  if (fetchedSchedules.length > 0) {
    try {
      saveMultipleWeekSchedules(fetchedSchedules);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[course-matcher] Could not save to classes.json:', message);
    }
  }

  return {
    allFlexibleClasses,
    enrolledClasses: Array.from(enrolledMap.values()),
    summariesByWeek,
    canBooking,
    targetWeek: target.weekMode,
    targetWeekLabel: target.weekLabel,
    targetMondays: Array.from(datesToFetch),
  };
}

// ── Candidate Evaluation Guards ─────────────────────────────────────────────

interface CandidateCheckResult {
  passed: boolean;
  status?: string;
  reason?: string;
}

function checkCapacityGuard(candidate: ClassSlot): CandidateCheckResult {
  const current = candidate.currentStudents ?? 0;
  const max = candidate.maxStudents ?? 0;
  if (max > 0 && current >= max) {
    return {
      passed: false,
      status: REGISTRATION_STATUS.CLASS_FULL,
      reason: `Class is full (${current}/${max} seats taken).`,
    };
  }
  return { passed: true };
}

function checkDuplicateTopicGuard(
  candidate: ClassSlot,
  enrolledClasses: ClassSlot[],
  plannedSlots: ClassSlot[]
): CandidateCheckResult {
  const candidateLesson = normalize(candidate.lesson || candidate.lessonInfo?.lesson);
  if (!candidateLesson) {
    return { passed: true };
  }

  const duplicateEnrolled = enrolledClasses.find((e) => {
    const eLesson = normalize(e.lesson || e.lessonInfo?.lesson);
    return eLesson && eLesson === candidateLesson;
  });
  if (duplicateEnrolled) {
    return {
      passed: false,
      status: REGISTRATION_STATUS.DUPLICATE_TOPIC,
      reason: `Already enrolled in class with the same name "${duplicateEnrolled.lesson}" on ${duplicateEnrolled.date}.`,
    };
  }

  const duplicatePlanned = plannedSlots.find((p) => {
    const pLesson = normalize(p.lesson || p.lessonInfo?.lesson);
    return pLesson && pLesson === candidateLesson;
  });
  if (duplicatePlanned) {
    return {
      passed: false,
      status: REGISTRATION_STATUS.DUPLICATE_TOPIC,
      reason: `Duplicate class: You have already selected "${duplicatePlanned.lesson}" on ${duplicatePlanned.date}.`,
    };
  }

  return { passed: true };
}

function checkTimeConflictGuard(
  candidate: ClassSlot,
  enrolledClasses: ClassSlot[],
  plannedSlots: ClassSlot[]
): CandidateCheckResult {
  const conflictEnrolled = enrolledClasses.find(
    (e) => e.date === candidate.date && hasTimeOverlap(candidate.startTime, candidate.endTime, e.startTime, e.endTime)
  );
  if (conflictEnrolled) {
    return {
      passed: false,
      status: REGISTRATION_STATUS.TIME_CONFLICT,
      reason: `Time conflict on ${candidate.date} (${candidate.startTime.slice(0, 5)} - ${candidate.endTime.slice(0, 5)}) with enrolled class "${conflictEnrolled.lesson}".`,
    };
  }

  const conflictPlanned = plannedSlots.find(
    (p) => p.date === candidate.date && hasTimeOverlap(candidate.startTime, candidate.endTime, p.startTime, p.endTime)
  );
  if (conflictPlanned) {
    return {
      passed: false,
      status: REGISTRATION_STATUS.TIME_CONFLICT,
      reason: `Time conflict on ${candidate.date} with planned class "${conflictPlanned.lesson}".`,
    };
  }

  return { passed: true };
}

function checkQuotaGuard(candidate: ClassSlot, quotaTrackers: Map<string, QuotaTracker>): CandidateCheckResult {
  const monday = getMondayOfWeek(candidate.date);
  const quotaKey = `${monday}:${candidate.programClassId}`;
  const quota = quotaTrackers.get(quotaKey);

  if (quota && quota.remaining <= 0) {
    return {
      passed: false,
      status: REGISTRATION_STATUS.QUOTA_EXCEEDED,
      reason: `Weekly quota reached for "${quota.programClassName}" (${quota.max}/${quota.max} classes allocated for week of ${monday}).`,
    };
  }

  return { passed: true };
}

// ── Course Planning & Validation Engine ─────────────────────────────────────

export async function planCourseRegistrations(
  client: TalkFirstApiClient,
  requestedCourses: CourseCriteria[],
  options: TargetWeekOptions = {}
): Promise<CoursePlanningResult> {
  const {
    allFlexibleClasses,
    enrolledClasses,
    summariesByWeek,
    canBooking,
    targetWeek,
    targetWeekLabel,
    targetMondays,
  } = await fetchMultiWeekSchedule(client, requestedCourses, options);

  const quotaTrackers = new Map<string, QuotaTracker>();
  for (const [monday, summaryList] of summariesByWeek.entries()) {
    for (const s of summaryList) {
      const key = `${monday}:${s.programClassId}`;
      quotaTrackers.set(key, {
        monday,
        programClassId: s.programClassId,
        programClassName: s.programClassName,
        max: s.maxClassesPerWeek,
        enrolled: s.enrolledClassesThisWeek,
        remaining: Math.max(0, s.maxClassesPerWeek - s.enrolledClassesThisWeek),
      });
    }
  }

  const plan: RegistrationPlanItem[] = [];
  const plannedSlots: ClassSlot[] = [];
  let availableCount = 0;

  for (const req of requestedCourses) {
    const matches = filterClasses(allFlexibleClasses, req);

    if (matches.length === 0) {
      plan.push({
        request: req,
        matches: [],
        selected: null,
        status: REGISTRATION_STATUS.NOT_FOUND,
        reason: 'No class slots match the criteria in the target schedule.',
      });
      continue;
    }

    // 1. Already enrolled check
    const enrolledMatch = matches.find((m) => m.hasEnrolled);
    if (enrolledMatch) {
      plan.push({
        request: req,
        matches,
        selected: enrolledMatch,
        status: REGISTRATION_STATUS.ALREADY_ENROLLED,
        reason: `Already enrolled in "${enrolledMatch.lesson}" on ${enrolledMatch.date} (${enrolledMatch.startTime.slice(0, 5)} - ${enrolledMatch.endTime.slice(0, 5)}).`,
      });
      continue;
    }

    // 2. Candidate evaluation
    let selectedCandidate: ClassSlot | null = null;
    let failureStatus: string | null = null;
    let failureReason: string | null = null;

    for (const candidate of matches) {
      const capCheck = checkCapacityGuard(candidate);
      if (!capCheck.passed) {
        if (!failureStatus) {
          failureStatus = capCheck.status!;
          failureReason = capCheck.reason!;
        }
        continue;
      }

      const dupCheck = checkDuplicateTopicGuard(candidate, enrolledClasses, plannedSlots);
      if (!dupCheck.passed) {
        if (!failureStatus) {
          failureStatus = dupCheck.status!;
          failureReason = dupCheck.reason!;
        }
        continue;
      }

      const conflictCheck = checkTimeConflictGuard(candidate, enrolledClasses, plannedSlots);
      if (!conflictCheck.passed) {
        if (!failureStatus) {
          failureStatus = conflictCheck.status!;
          failureReason = conflictCheck.reason!;
        }
        continue;
      }

      const quotaCheck = checkQuotaGuard(candidate, quotaTrackers);
      if (!quotaCheck.passed) {
        if (!failureStatus) {
          failureStatus = quotaCheck.status!;
          failureReason = quotaCheck.reason!;
        }
        continue;
      }

      selectedCandidate = candidate;
      const monday = getMondayOfWeek(candidate.date);
      const quotaKey = `${monday}:${candidate.programClassId}`;
      const quota = quotaTrackers.get(quotaKey);
      if (quota) {
        quota.remaining -= 1;
      }
      plannedSlots.push(candidate);
      break;
    }

    if (!selectedCandidate) {
      plan.push({
        request: req,
        matches,
        selected: matches[0],
        status: failureStatus || REGISTRATION_STATUS.UNAVAILABLE,
        reason: failureReason || 'Class slot is unavailable.',
      });
      continue;
    }

    const hasMultiple = matches.length > 1;
    plan.push({
      request: req,
      matches,
      selected: selectedCandidate,
      status: hasMultiple ? REGISTRATION_STATUS.MULTIPLE_MATCHES : REGISTRATION_STATUS.READY,
      reason: hasMultiple
        ? `Found ${matches.length} matching slots. Selected: ${selectedCandidate.date} ${selectedCandidate.startTime.slice(0, 5)}.`
        : `Ready to register: ${selectedCandidate.lesson} on ${selectedCandidate.date} (${selectedCandidate.startTime.slice(0, 5)} - ${selectedCandidate.endTime.slice(0, 5)}).`,
    });

    availableCount++;
  }

  return {
    plan,
    availableCount,
    totalRequested: requestedCourses.length,
    canBooking,
    quotaSummary: Array.from(quotaTrackers.values()),
    targetWeek,
    targetWeekLabel,
    targetMondays,
  };
}
