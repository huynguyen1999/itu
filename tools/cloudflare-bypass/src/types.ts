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
