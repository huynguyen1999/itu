/**
 * types.ts
 *
 * Core domain types and interfaces for the TalkFirst automated registration system.
 */

import type { RegistrationStatusType, WeekModeType } from './constants.ts';

// ── Authentication & Token Types ────────────────────────────────────────────

export interface JwtPayload {
  exp?: number;
  sub?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id?: string;
  email?: string;
  role?: string;
}

export interface AuthTokens {
  accessToken?: string;
  refreshToken?: string;
  savedAt?: string;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  user?: UserProfile;
}

export interface SaveTokensInput {
  accessToken?: string;
  refreshToken?: string;
}

export interface AuthStatusResponse {
  loggedIn: boolean;
  email: string | null;
  role: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  isOfflineMode: boolean;
}

// ── Schedule & Course Models ────────────────────────────────────────────────

export interface SubClassType {
  id?: string;
  name?: string;
  code?: string;
  [key: string]: unknown;
}

export interface LessonInfo {
  lesson?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ClassSlot {
  id: string;
  timeSlot?: string;
  programClassId: string;
  date: string;
  startTime: string;
  endTime: string;
  lesson: string;
  teacherName?: string;
  teacherNickName?: string;
  room?: string;
  currentStudents?: number;
  maxStudents?: number;
  hasEnrolled?: boolean;
  subClassType?: SubClassType | string;
  lessonInfo?: LessonInfo;
  [key: string]: unknown;
}

export interface WeekSummaryItem {
  programClassId: string;
  programClassName: string;
  maxClassesPerWeek: number;
  enrolledClassesThisWeek: number;
  [key: string]: unknown;
}

export interface WeekScheduleData {
  startDate?: string;
  endDate?: string;
  summary?: WeekSummaryItem[];
  canBooking?: boolean;
  flexibleClasses?: ClassSlot[];
  fixedClasses?: ClassSlot[];
  [key: string]: unknown;
}

export interface CachedWeekRecord extends WeekScheduleData {
  monday: string;
  fetchedAt: string;
}

export interface ClassesCacheStore {
  updatedAt: string | null;
  weeks: Record<string, CachedWeekRecord>;
  allClasses: ClassSlot[];
}

// ── Course Search & Planning Criteria ───────────────────────────────────────

export interface CourseCriteria {
  id?: string;
  timeSlot?: string;
  programClassId?: string;
  lesson?: string;
  date?: string;
  day?: string;
  dayOfWeek?: string;
  time?: string;
  startTime?: string;
  teacher?: string;
  teacherName?: string;
  teacherNickName?: string;
  room?: string;
  type?: string;
  subClassType?: SubClassType | string;
  [key: string]: unknown;
}

export interface QuotaTracker {
  monday: string;
  programClassId: string;
  programClassName: string;
  max: number;
  enrolled: number;
  remaining: number;
}

export interface RegistrationPlanItem {
  request: CourseCriteria;
  matches: ClassSlot[];
  selected: ClassSlot | null;
  status: RegistrationStatusType | string;
  reason: string;
}

export interface TargetWeeksResult {
  weekMode: WeekModeType;
  weekLabel: string;
  mondays: string[];
  primaryMonday: string;
}

export interface CoursePlanningResult {
  plan: RegistrationPlanItem[];
  availableCount: number;
  totalRequested: number;
  canBooking: boolean;
  quotaSummary: QuotaTracker[];
  targetWeek: string;
  targetWeekLabel: string;
  targetMondays: string[];
}

export interface MultiWeekScheduleResult {
  allFlexibleClasses: ClassSlot[];
  enrolledClasses: ClassSlot[];
  summariesByWeek: Map<string, WeekSummaryItem[]>;
  canBooking: boolean;
  targetWeek: string;
  targetWeekLabel: string;
  targetMondays: string[];
}

// ── Registration Execution & Reporting ──────────────────────────────────────

export interface RegistrationResultItem {
  status: string;
  lesson: string;
  date: string;
  time: string;
  teacher: string;
  room: string;
  message?: string;
  action?: 'REGISTER' | 'CANCEL';
  success?: boolean;
  response?: unknown;
}

export interface RegistrationReport {
  executedAt: string;
  studentEmail: string;
  targetWeek: string;
  targetWeekLabel: string;
  totalRequested: number;
  availableCount: number;
  results: RegistrationResultItem[];
}

export interface AutoRegisterRunResult {
  success: boolean;
  report?: RegistrationReport;
  cancelResults?: RegistrationResultItem[];
  registrationResults?: RegistrationResultItem[];
}

// ── Options & Configurations ────────────────────────────────────────────────

export interface ApiClientOptions {
  baseUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface TargetWeekOptions {
  date?: string;
  week?: string;
  weekType?: string;
  thisWeek?: boolean;
  nextWeek?: boolean;
  allWeeks?: boolean;
  toCancelCourses?: CourseCriteria[];
}

export interface BrowserLoginOptions {
  noSubmit?: boolean;
  fillOnly?: boolean;
}

export interface BrowserRegisterOptions extends TargetWeekOptions {
  dryRun?: boolean;
  concurrent?: boolean;
}

export interface AutoRegisterOptions extends TargetWeekOptions {
  file?: string;
  /** Inline course criteria — if provided, skips reading from `file`. */
  courses?: CourseCriteria[];
  dryRun?: boolean;
  toCancelCourses?: CourseCriteria[];
  fillOnly?: boolean;
  noSubmit?: boolean;
  justFill?: boolean;
  status?: boolean;
  refresh?: boolean;
  help?: boolean;
}

export interface PreRegisterServerOptions {
  port?: number;
  host?: string;
  offline?: boolean;
  noOpen?: boolean;
  bypass?: boolean;
  fetch?: boolean;
  latest?: boolean;
  sync?: boolean;
  cached?: boolean;
  local?: boolean;
}

// ── Student Registered List & Teacher Report Types ─────────────────────────

export interface RegisteredProgramClass {
  id: string;
  center?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  name: string;
  shortName?: string | null;
  description?: string | null;
  isActive?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegisteredSubClassType {
  id: string;
  center?: string;
  programClass?: RegisteredProgramClass;
  createdBy?: string | null;
  updatedBy?: string | null;
  name: string;
  shortName?: string | null;
  color?: string;
  bgColor?: string;
  isActive?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegisteredLevel {
  id: string;
  code: string;
  name: string;
  order: number;
  center?: string;
  isActive?: boolean;
  createdAt?: string;
  createdBy?: string | null;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface RegisteredCourseType {
  id: string;
  code: string;
  name: string;
  order?: number;
  center?: string;
  isActive?: boolean;
  classType?: string;
  createdAt?: string;
  createdBy?: string | null;
  shortName?: string | null;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface RegisteredFlexibleClass {
  id: string;
  center?: string;
  subClassType?: RegisteredSubClassType;
  createdBy?: string | null;
  updatedBy?: string | null;
  code?: string;
  levels?: RegisteredLevel[];
  courseFormats?: string[];
  courseTypes?: RegisteredCourseType[];
  startDate?: string;
  endDate?: string;
  totalWeeks?: number;
  weeksPassed?: number;
  totalLessons?: number;
  completedLessons?: number;
  enrolledStudents?: number;
  classScheduleSummary?: unknown;
  teacherSummary?: unknown;
  note?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
}

export interface RegisteredSlotTime {
  id: string;
  center?: string;
  timeRange?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  startTime: string;
  endTime: string;
  duration?: number;
  timeType?: string;
  isActive?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegisteredTeacher {
  id: string;
  center?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  teacherCode: string;
  fullName: string;
  nickName: string;
  email: string;
  phone?: string;
  jobTitle?: string | null;
  teacherType?: string;
  isActive?: boolean;
  calendarID?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegisteredRoom {
  id: string;
  center?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  name: string;
  slots?: number;
  crossCenter?: boolean;
  isActive?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegisteredLesson {
  id: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  lesson: string;
  isActive?: boolean;
  teacherDocLink?: string | null;
  studentDocUrl?: string | null;
  studentDocName?: string | null;
  printingDocUrl?: string | null;
  printingDocName?: string | null;
  studentDocKey?: string | null;
  printingDocKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegisteredFlexibleClassSchedule {
  id: string;
  flexibleClass: RegisteredFlexibleClass;
  slotTime: RegisteredSlotTime;
  teacher: RegisteredTeacher;
  room: RegisteredRoom;
  lesson: RegisteredLesson;
  courseMode?: string;
  lessonTab?: unknown;
  createdBy?: string | null;
  updatedBy?: string | null;
  date: string;
  slots?: number;
  ot?: boolean;
  lessonStatus?: string;
  status?: string;
  order?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  lessonGroupEmail?: string;
}

export interface RegisteredFlexibleClassItem {
  id: string;
  flexibleClassSchedule: RegisteredFlexibleClassSchedule;
  student: string;
  attendanceStatus?: string | null;
  attendanceBy?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  removedBy?: string | null;
  paymentCourse?: string;
  enrolledAt?: string;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isRemoved?: boolean;
  removedAt?: string | null;
}

export interface RegisteredListResponse {
  flexibleClass: RegisteredFlexibleClassItem[];
  scheduleClass: unknown[];
  [key: string]: unknown;
}

export interface EnrolledClassesStore {
  updatedAt: string | null;
  dateRange?: {
    startDate: string;
    endDate: string;
    type?: string;
  };
  totalEnrolled: number;
  enrolledClasses: RegisteredFlexibleClassItem[];
  raw?: RegisteredListResponse;
}

export interface TeacherClassItem {
  enrollmentId: string;
  scheduleId: string;
  date: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  timeRange: string;
  program: string;
  subClassType: string;
  subClassColor?: string;
  subClassBgColor?: string;
  lesson: string;
  room: string;
  teacherDocLink?: string | null;
  printingDocName?: string | null;
  printingDocUrl?: string | null;
  status: string;
  lessonStatus: string;
  enrolledAt: string;
}

export interface TeacherReportEntry {
  teacherId: string;
  teacherCode: string;
  fullName: string;
  nickName: string;
  email: string;
  phone?: string;
  teacherType?: string;
  totalClasses: number;
  classes: TeacherClassItem[];
}

export interface TeacherTeachingReport {
  generatedAt: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  totalTeachers: number;
  totalEnrolledClasses: number;
  teachers: TeacherReportEntry[];
}

export interface EnrolledClassesOptions {
  startDate?: string;
  endDate?: string;
  type?: string;
  week?: string;
  thisWeek?: boolean;
  nextWeek?: boolean;
  month?: boolean;
  thisMonth?: boolean;
  all?: boolean;
  offline?: boolean;
  report?: boolean;
  json?: boolean;
  help?: boolean;
}

