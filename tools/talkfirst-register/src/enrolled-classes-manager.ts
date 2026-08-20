/**
 * enrolled-classes-manager.ts
 *
 * Manages persistence of enrolled/registered student classes and generates
 * comprehensive teacher-to-classes teaching reports.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadClassesData } from './classes-manager.ts';
import { DAY_NAMES_TITLE } from './constants.ts';
import type {
  ClassSlot,
  EnrolledClassesStore,
  RegisteredFlexibleClassItem,
  RegisteredListResponse,
  RegisteredTeacher,
  TeacherClassItem,
  TeacherReportEntry,
  TeacherTeachingReport,
} from './types.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const ENROLLED_CLASSES_FILE = resolve(currentDir, '../enrolled-classes.json');
export const TEACHER_REPORT_MD_FILE = resolve(currentDir, '../teacher-classes-report.md');
export const TEACHER_REPORT_JSON_FILE = resolve(currentDir, '../teacher-classes-report.json');

/**
 * Builds a cache of known teacher metadata from rich campus responses.
 */
function buildTeacherRegistry(items: RegisteredFlexibleClassItem[]): Map<string, RegisteredTeacher> {
  const registry = new Map<string, RegisteredTeacher>();
  for (const item of items) {
    const t = item.flexibleClassSchedule?.teacher;
    if (!t) continue;
    if (t.fullName) {
      registry.set(t.fullName.trim().toLowerCase(), t);
    }
    if (t.nickName) {
      registry.set(t.nickName.trim().toLowerCase(), t);
    }
    if (t.teacherCode && t.teacherCode !== 'N/A') {
      registry.set(t.teacherCode.trim().toLowerCase(), t);
    }
  }
  return registry;
}

/**
 * Converts a ClassSlot from classes.json (with hasEnrolled: true) to RegisteredFlexibleClassItem.
 */
export function convertClassSlotToRegisteredItem(
  slot: ClassSlot,
  teacherRegistry?: Map<string, RegisteredTeacher>
): RegisteredFlexibleClassItem {
  const subTypeName =
    typeof slot.subClassType === 'object' && slot.subClassType !== null
      ? String(slot.subClassType.name || 'N/A')
      : String(slot.subClassType || 'N/A');
  const subTypeColor =
    typeof slot.subClassType === 'object' && slot.subClassType !== null && typeof slot.subClassType.color === 'string'
      ? slot.subClassType.color
      : undefined;
  const subTypeBgColor =
    typeof slot.subClassType === 'object' && slot.subClassType !== null
      ? typeof slot.subClassType.bgcolor === 'string'
        ? slot.subClassType.bgcolor
        : typeof slot.subClassType.bgColor === 'string'
          ? slot.subClassType.bgColor
          : undefined
      : undefined;

  const docKey =
    typeof slot.lessonInfo?.studentDocKey === 'string' && slot.lessonInfo.studentDocKey !== 'N/A'
      ? slot.lessonInfo.studentDocKey
      : null;
  const docLink = docKey ? `https://campus.talkfirst.vn/${docKey}` : null;

  const teacherName = slot.teacherName || 'Unknown Teacher';
  const teacherNick = slot.teacherNickName || teacherName;
  const reg =
    teacherRegistry?.get(teacherName.trim().toLowerCase()) ||
    teacherRegistry?.get(teacherNick.trim().toLowerCase());

  return {
    id: slot.id,
    flexibleClassSchedule: {
      id: slot.id,
      date: slot.date,
      slotTime: {
        id: slot.timeSlot || 'slot-time',
        startTime: slot.startTime || '00:00:00',
        endTime: slot.endTime || '00:00:00',
        duration: 90,
        timeType: (slot.timeType as string) || 'STANDARD',
        isActive: true,
        order: 1,
      },
      teacher: {
        id: reg?.id || teacherName,
        teacherCode: reg?.teacherCode || 'N/A',
        fullName: reg?.fullName || teacherName,
        nickName: reg?.nickName || teacherNick,
        email: reg?.email || 'N/A',
        phone: reg?.phone,
        teacherType: reg?.teacherType,
        isActive: true,
      },
      room: {
        id: 'room-id',
        name: slot.room || 'Ground',
        isActive: true,
      },
      lesson: {
        id: slot.id,
        lesson: slot.lesson || slot.lessonInfo?.lesson || 'Untitled Lesson',
        isActive: true,
        teacherDocLink: docLink,
        studentDocUrl: docLink,
        studentDocName: slot.lessonInfo?.lesson || 'Materials',
        printingDocName: null,
        printingDocUrl: null,
        studentDocKey: docKey || null,
        printingDocKey: null,
      },
      flexibleClass: {
        id: slot.id,
        code: 'FLEX',
        subClassType: {
          id: 'sub-class-type',
          name: subTypeName,
          color: subTypeColor,
          bgColor: subTypeBgColor,
          programClass: {
            id: slot.programClassId || 'program-class',
            name: (slot.programClassName as string) || 'TalkFirst Program',
            isActive: true,
          },
          isActive: true,
        },
      },
      status: 'active',
      lessonStatus: 'waiting',
      isActive: true,
    },
    student: 'current-student',
    enrolledAt: slot.date,
  };
}

/**
 * Creates a unique deterministic key for an enrolled class item to avoid duplicate entries.
 */
function getEnrolledClassKey(item: RegisteredFlexibleClassItem): string {
  const schedule = item.flexibleClassSchedule;
  if (!schedule) return item.id;
  const dateStr = schedule.date ? schedule.date.slice(0, 10) : '';
  const timeStr = schedule.slotTime?.startTime ? schedule.slotTime.startTime.slice(0, 5) : '';
  const lessonStr = schedule.lesson?.lesson || '';
  return `${dateStr}_${timeStr}_${lessonStr}`.toLowerCase();
}

/**
 * Loads stored enrolled classes from enrolled-classes.json, merged with any enrolled
 * classes from classes.json so all weekly schedule enrollments are preserved.
 */
export function loadEnrolledClassesData(): EnrolledClassesStore {
  let fileItems: RegisteredFlexibleClassItem[] = [];
  let fileStore: Partial<EnrolledClassesStore> = {};

  if (existsSync(ENROLLED_CLASSES_FILE)) {
    try {
      const raw = readFileSync(ENROLLED_CLASSES_FILE, 'utf-8');
      fileStore = JSON.parse(raw) as Partial<EnrolledClassesStore>;
      fileItems = Array.isArray(fileStore.enrolledClasses) ? fileStore.enrolledClasses : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[enrolled-classes-manager] Failed to read enrolled-classes.json:', message);
    }
  }

  const teacherRegistry = buildTeacherRegistry(fileItems);
  const classMap = new Map<string, RegisteredFlexibleClassItem>();

  // 1. Add file items (which may have richer metadata like teacher emails and documents)
  for (const item of fileItems) {
    const key = getEnrolledClassKey(item);
    classMap.set(key, item);
  }

  // 2. Synthesize enrolled classes from classes.json
  try {
    const classesData = loadClassesData();
    const enrolledSlotsFromWeeks: ClassSlot[] = [];

    for (const week of Object.values(classesData.weeks || {})) {
      const flex = (week.flexibleClasses || []).filter((c) => c.hasEnrolled);
      const fixed = (week.fixedClasses || []).filter((c) => c.hasEnrolled);
      enrolledSlotsFromWeeks.push(...flex, ...fixed);
    }

    for (const slot of enrolledSlotsFromWeeks) {
      const converted = convertClassSlotToRegisteredItem(slot, teacherRegistry);
      const key = getEnrolledClassKey(converted);
      if (!classMap.has(key)) {
        classMap.set(key, converted);
      } else {
        // Enhance existing item if it was missing teacher details or document link
        const existing = classMap.get(key)!;
        const exTeacher = existing.flexibleClassSchedule?.teacher;
        const convTeacher = converted.flexibleClassSchedule?.teacher;
        if ((!exTeacher?.fullName || exTeacher.fullName === 'Unknown Teacher') && convTeacher?.fullName) {
          exTeacher.fullName = convTeacher.fullName;
        }
        if ((!exTeacher?.nickName || exTeacher.nickName === 'Teacher') && convTeacher?.nickName) {
          exTeacher.nickName = convTeacher.nickName;
        }
        if (!existing.flexibleClassSchedule?.lesson?.teacherDocLink && converted.flexibleClassSchedule?.lesson?.teacherDocLink) {
          existing.flexibleClassSchedule.lesson.teacherDocLink = converted.flexibleClassSchedule.lesson.teacherDocLink;
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[enrolled-classes-manager] Error merging from classes.json:', message);
  }

  const mergedItems = Array.from(classMap.values()).sort((a, b) => {
    const dateA = a.flexibleClassSchedule?.date?.slice(0, 10) || '';
    const dateB = b.flexibleClassSchedule?.date?.slice(0, 10) || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.flexibleClassSchedule?.slotTime?.startTime || '';
    const timeB = b.flexibleClassSchedule?.slotTime?.startTime || '';
    return timeA.localeCompare(timeB);
  });

  return {
    updatedAt: fileStore.updatedAt || new Date().toISOString(),
    dateRange: fileStore.dateRange,
    totalEnrolled: mergedItems.length,
    enrolledClasses: mergedItems,
    raw: fileStore.raw,
  };
}

/**
 * Checks if enrolled-classes.json exists and contains records.
 */
export function hasCachedEnrolledClasses(): boolean {
  const data = loadEnrolledClassesData();
  return Boolean(data.enrolledClasses && data.enrolledClasses.length > 0);
}

/**
 * Saves enrolled classes response to enrolled-classes.json, merging with existing records
 * so data from previously fetched weeks or ranges is never lost.
 */
export function saveEnrolledClassesData(
  response: RegisteredListResponse,
  dateRange?: { startDate: string; endDate: string; type?: string }
): EnrolledClassesStore {
  const existingStore = loadEnrolledClassesData();
  const incomingItems = Array.isArray(response.flexibleClass) ? response.flexibleClass : [];
  const teacherRegistry = buildTeacherRegistry([...existingStore.enrolledClasses, ...incomingItems]);

  const classMap = new Map<string, RegisteredFlexibleClassItem>();

  // Add existing items
  for (const item of existingStore.enrolledClasses) {
    classMap.set(getEnrolledClassKey(item), item);
  }

  // Merge or overwrite with new live items
  for (const item of incomingItems) {
    classMap.set(getEnrolledClassKey(item), item);
  }

  const mergedItems = Array.from(classMap.values()).sort((a, b) => {
    const dateA = a.flexibleClassSchedule?.date?.slice(0, 10) || '';
    const dateB = b.flexibleClassSchedule?.date?.slice(0, 10) || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.flexibleClassSchedule?.slotTime?.startTime || '';
    const timeB = b.flexibleClassSchedule?.slotTime?.startTime || '';
    return timeA.localeCompare(timeB);
  });

  const store: EnrolledClassesStore = {
    updatedAt: new Date().toISOString(),
    dateRange,
    totalEnrolled: mergedItems.length,
    enrolledClasses: mergedItems,
    raw: response,
  };

  writeFileSync(ENROLLED_CLASSES_FILE, JSON.stringify(store, null, 2), 'utf-8');
  console.log(`💾 [enrolled-classes-manager] Saved ${mergedItems.length} total enrolled class(es) to: ${ENROLLED_CLASSES_FILE}`);
  return store;
}

/**
 * Derives day of week name from date string (YYYY-MM-DD or ISO).
 */
function getDayOfWeekName(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const cleanDate = dateStr.slice(0, 10);
  const [y, m, d] = cleanDate.split('-').map(Number);
  if (!y || !m || !d) return 'N/A';
  const dateObj = new Date(y, m - 1, d);
  const dayIndex = dateObj.getDay();
  return DAY_NAMES_TITLE[dayIndex] || 'N/A';
}

/**
 * Generates an aggregated Teacher Teaching Report from enrolled classes.
 */
export function generateTeacherReport(
  enrolledItems: RegisteredFlexibleClassItem[],
  dateRange?: { startDate: string; endDate: string }
): TeacherTeachingReport {
  const teacherMap = new Map<string, TeacherReportEntry>();

  for (const item of enrolledItems) {
    const schedule = item.flexibleClassSchedule;
    if (!schedule) continue;

    const teacher = schedule.teacher;
    const fullName = (teacher?.fullName || 'Unknown Teacher').trim();
    const nickName = (teacher?.nickName || fullName).trim();
    const teacherKey = fullName || nickName;
    const teacherId = teacher?.id || teacher?.teacherCode || teacherKey;
    const teacherCode = teacher?.teacherCode || 'N/A';
    const email = teacher?.email || 'N/A';
    const phone = teacher?.phone;
    const teacherType = teacher?.teacherType;

    const date = schedule.date ? schedule.date.slice(0, 10) : 'N/A';
    const startTime = schedule.slotTime?.startTime ? schedule.slotTime.startTime.slice(0, 5) : 'N/A';
    const endTime = schedule.slotTime?.endTime ? schedule.slotTime.endTime.slice(0, 5) : 'N/A';
    const timeRange = startTime !== 'N/A' && endTime !== 'N/A' ? `${startTime} – ${endTime}` : 'N/A';

    const subClassType = schedule.flexibleClass?.subClassType;
    const program = subClassType?.programClass?.name || 'N/A';
    const subClassName = subClassType?.name || 'N/A';
    const lesson = schedule.lesson?.lesson || 'N/A';
    const room = schedule.room?.name || 'N/A';

    const classItem: TeacherClassItem = {
      enrollmentId: item.id,
      scheduleId: schedule.id,
      date,
      dayOfWeek: getDayOfWeekName(date),
      startTime,
      endTime,
      timeRange,
      program,
      subClassType: subClassName,
      subClassColor: subClassType?.color,
      subClassBgColor: subClassType?.bgColor,
      lesson,
      room,
      teacherDocLink: schedule.lesson?.teacherDocLink || null,
      printingDocName: schedule.lesson?.printingDocName || null,
      printingDocUrl: schedule.lesson?.printingDocUrl || null,
      status: schedule.status || 'active',
      lessonStatus: schedule.lessonStatus || 'waiting',
      enrolledAt: item.enrolledAt ? item.enrolledAt.slice(0, 19).replace('T', ' ') : 'N/A',
    };

    if (!teacherMap.has(teacherKey)) {
      teacherMap.set(teacherKey, {
        teacherId,
        teacherCode,
        fullName,
        nickName,
        email,
        phone,
        teacherType,
        totalClasses: 0,
        classes: [],
      });
    }

    const entry = teacherMap.get(teacherKey)!;
    // Enrich teacher metadata if missing
    if (entry.teacherCode === 'N/A' && teacherCode !== 'N/A') entry.teacherCode = teacherCode;
    if (entry.email === 'N/A' && email !== 'N/A') entry.email = email;
    if (!entry.phone && phone) entry.phone = phone;
    if (!entry.teacherType && teacherType) entry.teacherType = teacherType;

    entry.classes.push(classItem);
    entry.totalClasses += 1;
  }

  // Sort each teacher's classes chronologically
  for (const entry of teacherMap.values()) {
    entry.classes.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.startTime.localeCompare(b.startTime);
    });
  }

  // Sort teachers by total classes descending, then full name ascending
  const teachers = Array.from(teacherMap.values()).sort((a, b) => {
    if (b.totalClasses !== a.totalClasses) {
      return b.totalClasses - a.totalClasses;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    totalTeachers: teachers.length,
    totalEnrolledClasses: enrolledItems.length,
    teachers,
  };
}

/**
 * Formats a TeacherTeachingReport as a GitHub Flavored Markdown document.
 */
export function formatTeacherReportMarkdown(report: TeacherTeachingReport): string {
  const dateRangeStr = report.dateRange
    ? `${report.dateRange.startDate} to ${report.dateRange.endDate}`
    : 'All Recorded Dates';

  const lines: string[] = [
    '# 👨‍🏫 TalkFirst Teacher & Enrolled Classes Report',
    '',
    `**Generated At:** ${report.generatedAt.slice(0, 19).replace('T', ' ')} UTC  `,
    `**Target Date Range:** ${dateRangeStr}  `,
    `**Total Teachers:** ${report.totalTeachers}  `,
    `**Total Enrolled Classes:** ${report.totalEnrolledClasses}  `,
    '',
    '---',
    '',
    '## 📊 Teacher Teaching Overview',
    '',
    '| # | Teacher Name | Nickname | Code | Email | Total Classes |',
    '|---|---|---|---|---|---|',
  ];

  report.teachers.forEach((t, idx) => {
    lines.push(
      `| ${idx + 1} | **${t.fullName}** | ${t.nickName} | \`${t.teacherCode}\` | ${t.email} | **${t.totalClasses}** |`
    );
  });

  lines.push('', '---', '', '## 📋 Detailed Teaching Schedule by Teacher', '');

  for (const teacher of report.teachers) {
    lines.push(
      `### 🧑‍🏫 ${teacher.fullName} (${teacher.nickName})`,
      '',
      `- **Teacher Code:** \`${teacher.teacherCode}\``,
      `- **Email:** [${teacher.email}](mailto:${teacher.email})`,
      teacher.phone ? `- **Phone:** ${teacher.phone}` : '',
      teacher.teacherType ? `- **Type:** ${teacher.teacherType}` : '',
      `- **Total Classes Taught:** ${teacher.totalClasses}`,
      '',
      '| Date | Day | Time | Program & Type | Lesson / Topic | Room | Handout / Materials |',
      '|---|---|---|---|---|---|---|'
    );

    for (const cls of teacher.classes) {
      const materials = cls.teacherDocLink
        ? `[Handout / Link](${cls.teacherDocLink})${cls.printingDocName && cls.printingDocName !== 'N/A' ? `<br><small>${cls.printingDocName}</small>` : ''}`
        : cls.printingDocName && cls.printingDocName !== 'N/A'
          ? `\`${cls.printingDocName}\``
          : 'N/A';

      lines.push(
        `| ${cls.date} | ${cls.dayOfWeek} | ${cls.timeRange} | ${cls.program} (${cls.subClassType}) | **${cls.lesson}** | ${cls.room} | ${materials} |`
      );
    }

    lines.push('', '---', '');
  }

  return lines.filter((l) => l !== '').join('\n') + '\n';
}

/**
 * Persists the teacher teaching report to both markdown and json files.
 */
export function saveTeacherReport(report: TeacherTeachingReport): { mdPath: string; jsonPath: string } {
  const mdContent = formatTeacherReportMarkdown(report);
  writeFileSync(TEACHER_REPORT_MD_FILE, mdContent, 'utf-8');
  writeFileSync(TEACHER_REPORT_JSON_FILE, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`📄 [enrolled-classes-manager] Markdown report saved to: ${TEACHER_REPORT_MD_FILE}`);
  console.log(`📄 [enrolled-classes-manager] JSON report saved to:     ${TEACHER_REPORT_JSON_FILE}`);

  return { mdPath: TEACHER_REPORT_MD_FILE, jsonPath: TEACHER_REPORT_JSON_FILE };
}

/**
 * Prints a formatted console output of the report.
 */
export function printTeacherReportConsole(report: TeacherTeachingReport): void {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║                   TEACHER & ENROLLED CLASSES REPORT                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📅 Date Range: ${report.dateRange ? `${report.dateRange.startDate} to ${report.dateRange.endDate}` : 'N/A'}`);
  console.log(`👥 Total Teachers: ${report.totalTeachers} | 📚 Total Enrolled Classes: ${report.totalEnrolledClasses}\n`);

  console.log('📊 Teacher Summary:');
  console.table(
    report.teachers.map((t) => ({
      Teacher: t.fullName,
      Nickname: t.nickName,
      Code: t.teacherCode,
      Email: t.email,
      Classes: t.totalClasses,
    }))
  );

  console.log('\n📋 Detailed Classes by Teacher:');
  for (const t of report.teachers) {
    console.log(`\n👨‍🏫 ${t.fullName} (${t.nickName}) — ${t.totalClasses} class(es):`);
    console.table(
      t.classes.map((c) => ({
        Date: c.date,
        Day: c.dayOfWeek,
        Time: c.timeRange,
        Type: c.subClassType,
        Lesson: c.lesson,
        Room: c.room,
        Status: c.status,
      }))
    );
  }
}

