/**
 * constants.ts
 *
 * Centralized constant definitions for TalkFirst automated course registration & bypass engine.
 * Eliminates magic strings and numbers across all modules.
 */

export const DEFAULT_TALKFIRST_BASE_URL = 'https://campus.talkfirst.vn';
export const DEFAULT_CDP_ENDPOINT = 'http://127.0.0.1:9223';
export const DEFAULT_CHROME_EXECUTABLE_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const DEFAULT_USER_DATA_DIR = '/tmp/chrome-debug';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

export const DEFAULT_PRE_REGISTER_PORT = 3333;
export const DEFAULT_EXPIRY_SAFETY_BUFFER_SECONDS = 60;

/**
 * API route paths.
 */
export const API_ROUTES = {
  AUTH_LOGIN: '/api/student/auth/login/',
  AUTH_REFRESH: '/api/student/auth/refresh/',
  SCHEDULE_CLASSES: '/api/student/my-schedule/classes/',
  MY_SCHEDULE: '/api/student/my-schedule',
} as const;

/**
 * Frontend web routes on TalkFirst campus.
 */
export const WEB_ROUTES = {
  HOME: '/',
  AUTH_LOGIN: '/auth/login',
  MY_SCHEDULE: '/my-schedule/',
} as const;

/**
 * DOM selectors for UI automation.
 */
export const SELECTORS = {
  TURNSTILE_RESPONSE_INPUT: '[name="cf-turnstile-response"]',
  TURNSTILE_FRAME_HOST: 'challenges.cloudflare.com',
  TURNSTILE_CHECKBOX: 'input[type="checkbox"]',
  TURNSTILE_SOLVED_MARKER: '[data-state="solved"], .is-solved',
  LOGIN_USERNAME_INPUT: 'input[placeholder*="sername"], input[type="text"], input[type="email"]',
  LOGIN_PASSWORD_INPUT: 'input[type="password"]',
  LOGIN_SUBMIT_BUTTON: 'button[type="submit"], button:has-text("SIGN IN")',
  SCHEDULE_GRID_ROW: 'div.w-full.flex.gap-1.items-stretch',
  SCHEDULE_GRID_CELL: 'div.grid-cols-7 > div.col-span-1, div.grid-cols-7 > div',
  SCHEDULE_CARD_WRAPPER: 'div.relative',
  SCHEDULE_CURSOR_POINTER: 'div.cursor-pointer',
  POPOVER_PORTAL: 'div.fixed.z-\\[10000\\], div.fixed.pointer-events-auto, div[data-radix-popper-content-wrapper]',
  POPOVER_SEARCH_ELEMENTS: [
    'div.fixed.z-\\[10000\\]',
    'div.fixed.pointer-events-auto',
    'div[data-radix-popper-content-wrapper]',
    'div[role="dialog"]',
    'div[role="tooltip"]',
  ] as const,
  REGISTER_BUTTON:
    'div.fixed.z-\\[10000\\] button:not([aria-label="Close"]), div.fixed button:not([aria-label="Close"]), div[data-radix-popper-content-wrapper] button:not([aria-label="Close"])',
  CANCEL_BUTTON:
    'div.fixed.z-\\[10000\\] button:not([aria-label="Close"]), div.fixed button:not([aria-label="Close"]), div[data-radix-popper-content-wrapper] button:not([aria-label="Close"])',
  MODAL_DIALOG: 'div.z-9999, div[role="dialog"], div[data-radix-dialog-content]',
  MODAL_CONFIRM_BUTTON:
    'div[role="dialog"] button[type="submit"], div[role="dialog"] button:has-text("Confirm"), div[role="dialog"] button:has-text("Xác nhận"), div[role="dialog"] button:has-text("Register"), div[role="dialog"] button:has-text("Đăng ký"), div.z-9999 button[type="submit"], div.z-9999 button:has-text("Confirm"), div.z-9999 button:has-text("Xác nhận"), button:has-text("Confirm"), button:has-text("Xác nhận")',
  MODAL_CANCEL_CLASS_BUTTON:
    'div[role="dialog"] button[type="submit"], div[role="dialog"] button:has-text("Cancel Class"), div[role="dialog"] button:has-text("Hủy lớp"), div[role="dialog"] button:has-text("Cancel Registration"), div[role="dialog"] button:has-text("Hủy đăng ký"), div[role="dialog"] button:has-text("Confirm"), div[role="dialog"] button:has-text("Xác nhận"), div[role="dialog"] button:has-text("Close"), div[role="dialog"] button:has-text("Đóng"), div.z-9999 button[type="submit"], div.z-9999 button:has-text("Cancel Class"), div.z-9999 button:has-text("Hủy lớp"), div.z-9999 button:has-text("Confirm"), div.z-9999 button:has-text("Xác nhận"), button:has-text("Cancel Class"), button:has-text("Hủy lớp")',
  MODAL_DISMISS_BUTTON:
    'button[aria-label="Close"], button:has-text("Back"), button:has-text("Quay lại"), button:has-text("Keep")',
  TOAST_CONTAINER: '[role="status"], [role="alert"], div.toast, div[data-sonner-toast], li[data-sonner-toast]',
  SCHEDULE_WEEK_BUTTON: 'button:has-text("Week"), div.grid-cols-7',
  SCHEDULE_ALL_FILTER_BUTTON: 'button:has-text("All")',
} as const;

/**
 * Timeouts in milliseconds.
 */
export const TIMEOUTS = {
  CDP_PROBE_MS: 1000,
  CHROME_LAUNCH_STEP_MS: 500,
  MAX_CHROME_LAUNCH_ATTEMPTS: 20,
  PAGE_NAVIGATION_MS: 30000,
  PAGE_SCHEDULE_NAVIGATION_MS: 25000,
  TURNSTILE_DETECTION_ATTEMPTS: 15,
  TURNSTILE_POLL_INTERVAL_MS: 400,
  TURNSTILE_LOGIN_TIMEOUT_MS: 25000,
  TURNSTILE_MODAL_TIMEOUT_MS: 15000,
  POPOVER_HOVER_DELAY_MS: 350,
  POPOVER_VISIBILITY_TIMEOUT_MS: 2500,
  ROW_LOCATE_TIMEOUT_MS: 4000,
  CELL_LOCATE_TIMEOUT_MS: 2000,
  BUTTON_CLICK_TIMEOUT_MS: 5000,
  MODAL_CLOSE_TIMEOUT_MS: 6000,
  NETWORK_IDLE_TIMEOUT_MS: 6000,
  AUTH_TRANSITION_TIMEOUT_MS: 12000,
  TAB_DISPOSAL_DELAY_MS: 1500,
} as const;

/**
 * Registration status keys.
 */
export const REGISTRATION_STATUS = {
  READY: 'READY',
  READY_DRY_RUN: 'READY_DRY_RUN',
  MULTIPLE_MATCHES: 'MULTIPLE_MATCHES',
  ALREADY_ENROLLED: 'ALREADY_ENROLLED',
  DUPLICATE_TOPIC: 'DUPLICATE_TOPIC',
  CLASS_FULL: 'CLASS_FULL',
  TIME_CONFLICT: 'TIME_CONFLICT',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  UNAVAILABLE: 'UNAVAILABLE',
  HOVER_FAILED: 'HOVER_FAILED',
  REGISTER_BUTTON_MISSING: 'REGISTER_BUTTON_MISSING',
  CONFIRM_BUTTON_MISSING: 'CONFIRM_BUTTON_MISSING',
  REGISTERED: 'REGISTERED',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  CANCELLED: 'CANCELLED',
  CANCEL_FAILED: 'CANCEL_FAILED',
  TAB_ERROR: 'TAB_ERROR',
} as const;

export type RegistrationStatusType = (typeof REGISTRATION_STATUS)[keyof typeof REGISTRATION_STATUS];

/**
 * Visual badge formatting for statuses.
 */
export const STATUS_BADGES: Record<string, string> = {
  [REGISTRATION_STATUS.READY]: '✅ READY',
  [REGISTRATION_STATUS.READY_DRY_RUN]: '⏳ READY (Dry Run)',
  [REGISTRATION_STATUS.MULTIPLE_MATCHES]: '🔍 MULTIPLE MATCHES',
  [REGISTRATION_STATUS.ALREADY_ENROLLED]: '📌 ALREADY ENROLLED',
  [REGISTRATION_STATUS.DUPLICATE_TOPIC]: '🔁 DUPLICATE CLASS',
  [REGISTRATION_STATUS.CLASS_FULL]: '🚫 CLASS FULL',
  [REGISTRATION_STATUS.TIME_CONFLICT]: '⚠️ TIME CONFLICT',
  [REGISTRATION_STATUS.QUOTA_EXCEEDED]: '🛑 QUOTA EXCEEDED',
  [REGISTRATION_STATUS.NOT_FOUND]: '❌ NOT FOUND',
  [REGISTRATION_STATUS.UNAVAILABLE]: '⚠️ UNAVAILABLE',
  [REGISTRATION_STATUS.HOVER_FAILED]: '❌ HOVER FAILED',
  [REGISTRATION_STATUS.REGISTER_BUTTON_MISSING]: '❌ REGISTER BUTTON MISSING',
  [REGISTRATION_STATUS.CONFIRM_BUTTON_MISSING]: '❌ CONFIRM BUTTON MISSING',
  [REGISTRATION_STATUS.REGISTERED]: '✅ REGISTERED',
  [REGISTRATION_STATUS.REGISTRATION_FAILED]: '❌ REGISTRATION FAILED',
  [REGISTRATION_STATUS.CANCELLED]: '✅ CANCELLED',
  [REGISTRATION_STATUS.CANCEL_FAILED]: '❌ CANCEL FAILED',
  [REGISTRATION_STATUS.TAB_ERROR]: '❌ TAB ERROR',
};

/**
 * Week selection modes.
 */
export const WEEK_MODES = {
  THIS: 'this',
  NEXT: 'next',
  ALL: 'all',
  CUSTOM: 'custom',
} as const;

export type WeekModeType = (typeof WEEK_MODES)[keyof typeof WEEK_MODES];

/**
 * Days of the week in standard order (0 = Sunday).
 */
export const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export const DAY_NAMES_TITLE = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Alias mapping for day input normalization.
 */
export const DAY_ALIASES: Readonly<Record<string, string>> = {
  sun: 'sunday',
  mon: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  fri: 'friday',
  sat: 'saturday',
};
