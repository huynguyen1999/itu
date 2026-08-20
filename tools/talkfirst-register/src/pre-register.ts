/**
 * pre-register.ts
 *
 * Interactive Course Pre-Registration Server & Timetable Web UI for TalkFirst.
 * Built with Hono & mri with full TypeScript type safety, static asset serving, and auto-sync support.
 */

import { exec } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import mri from 'mri';

function getLocalIpAddresses(): string[] {
  const interfaces = networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

import { TalkFirstApiClient } from './api-client.ts';
import { runAutoRegister } from './auto-register.ts';
import { cancelCourseInBrowser } from './browser-registrar.ts';
import { performBrowserLogin } from './bypass.ts';
import {
  CLASSES_FILE,
  getCachedWeekSchedule,
  hasCachedClasses,
  loadClassesData,
  saveMultipleWeekSchedules,
  saveWeekSchedule,
} from './classes-manager.ts';
import { DEFAULT_PRE_REGISTER_PORT, WEEK_MODES } from './constants.ts';
import { getMondayOfWeek, getSundayOfWeek, planCourseRegistrations } from './course-matcher.ts';
import {
  ENROLLED_CLASSES_FILE,
  generateTeacherReport,
  loadEnrolledClassesData,
  saveEnrolledClassesData,
  saveTeacherReport,
} from './enrolled-classes-manager.ts';
import { isTokenExpired, loadTokens, saveTokens } from './token-manager.ts';
import type {
  AuthStatusResponse,
  AuthTokens,
  CourseCriteria,
  PreRegisterServerOptions,
  RegisteredListResponse,
  WeekScheduleData,
} from './types.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(currentDir, '..');
const COURSES_FILE = resolve(ROOT_DIR, 'courses.json');
const TEACHER_NOTES_FILE = resolve(ROOT_DIR, 'teacher-notes.json');
const HTML_FILE = resolve(currentDir, 'ui/index.html');
const CSS_FILE = resolve(currentDir, 'ui/styles.css');
const JS_FILE = resolve(currentDir, 'ui/app.js');
const FAVICON_FILE = resolve(currentDir, 'ui/favicon.svg');

function loadTeacherNotes(): Record<string, any> {
  try {
    if (existsSync(TEACHER_NOTES_FILE)) {
      return JSON.parse(readFileSync(TEACHER_NOTES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Pre-Registrar] Failed to read teacher-notes.json:', err);
  }
  return {};
}

function saveTeacherNotes(notes: Record<string, any>): void {
  try {
    writeFileSync(TEACHER_NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Pre-Registrar] Failed to save teacher-notes.json:', err);
  }
}

// Auto-load .env if present in root or tools directory
try {
  const envPath = resolve(ROOT_DIR, '.env');
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
} catch {}

/**
 * Ensures session is authenticated, attempting automatic refresh or browser login if necessary.
 */
async function ensureAuthenticatedSession(client: TalkFirstApiClient): Promise<AuthTokens | null> {
  console.log('🔑 [Pre-Registrar] Checking authentication session...');
  let tokens = loadTokens();
  if (!tokens?.accessToken && !tokens?.refreshToken) {
    console.log('   ⚠️  No session tokens found. Launching automated browser login & Turnstile solver...\n');
    await performBrowserLogin();
    tokens = loadTokens();
  }
  try {
    await client.ensureValidAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️  Token refresh failed (${message}). Launching browser login...\n`);
    await performBrowserLogin();
    await client.ensureValidAccessToken();
  }
  return loadTokens();
}

/**
 * Fetches schedules for current and next week and updates classes.json.
 */
async function fetchAndCacheLiveSchedules(client: TalkFirstApiClient): Promise<void> {
  const thisMonday = getMondayOfWeek(new Date());
  const [ty, tm, td] = thisMonday.split('-').map(Number);
  const nextMonday = getMondayOfWeek(new Date(ty, tm - 1, td + 7));

  console.log('🌐 [Pre-Registrar] Fetching latest classes from TalkFirst API...');
  const fetched: Array<{ monday: string; schedule: WeekScheduleData }> = [];
  for (const monday of [thisMonday, nextMonday]) {
    try {
      console.log(`   Fetching week of ${monday}...`);
      const schedule = await client.fetchSchedule({ date: monday, weekType: 'current' });
      fetched.push({ monday, schedule });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`   ⚠️ Could not fetch schedule for ${monday}: ${message}`);
    }
  }
  if (fetched.length > 0) {
    saveMultipleWeekSchedules(fetched);
    console.log(`   ✅ Latest classes saved to: ${CLASSES_FILE}\n`);
  }
}

/**
 * Creates and starts the Hono app server.
 */
export function startPreRegisterServer(options: PreRegisterServerOptions = {}): ReturnType<typeof serve> {
  const port = Number(options.port || process.env.PORT || DEFAULT_PRE_REGISTER_PORT);
  const client = new TalkFirstApiClient();
  const isForcedOffline = Boolean(options.offline);

  const app = new Hono();
  app.use('*', cors());

  // 1. Static UI & Assets
  app.get('/', (c) => {
    if (!existsSync(HTML_FILE)) {
      return c.text('UI HTML file not found at src/ui/index.html', 404);
    }
    return c.html(readFileSync(HTML_FILE, 'utf-8'));
  });

  app.get('/styles.css', (c) => {
    if (!existsSync(CSS_FILE)) {
      return c.text('Not found', 404);
    }
    return c.body(readFileSync(CSS_FILE, 'utf-8'), 200, { 'Content-Type': 'text/css' });
  });

  app.get('/app.js', (c) => {
    if (!existsSync(JS_FILE)) {
      return c.text('Not found', 404);
    }
    return c.body(readFileSync(JS_FILE, 'utf-8'), 200, { 'Content-Type': 'application/javascript' });
  });

  const UI_MODULES_DIR = resolve(currentDir, 'ui/modules');
  app.get('/modules/:file', (c) => {
    const file = c.req.param('file');
    const filePath = resolve(UI_MODULES_DIR, file);
    if (!existsSync(filePath)) {
      return c.text('Not found', 404);
    }
    return c.body(readFileSync(filePath, 'utf-8'), 200, { 'Content-Type': 'application/javascript' });
  });

  app.get('/favicon.svg', (c) => {
    if (!existsSync(FAVICON_FILE)) {
      return c.text('Not found', 404);
    }
    return c.body(readFileSync(FAVICON_FILE, 'utf-8'), 200, { 'Content-Type': 'image/svg+xml' });
  });

  app.get('/favicon.ico', (c) => {
    if (!existsSync(FAVICON_FILE)) {
      return c.text('Not found', 404);
    }
    return c.body(readFileSync(FAVICON_FILE, 'utf-8'), 200, { 'Content-Type': 'image/svg+xml' });
  });

  // 2. Auth Status
  app.get('/api/auth-status', (c) => {
    const tokens = loadTokens();
    const responsePayload: AuthStatusResponse = {
      loggedIn: Boolean(tokens?.accessToken),
      email: tokens?.user?.email || null,
      role: tokens?.user?.role || null,
      expiresAt: tokens?.accessTokenExpiresAt || null,
      isExpired: isTokenExpired(tokens?.accessToken, 0),
      isOfflineMode: isForcedOffline,
    };
    return c.json(responsePayload);
  });

  // 3. Cache Status
  app.get('/api/classes-cache-status', (c) => {
    const cache = loadClassesData();
    return c.json({
      hasCache: Boolean(cache.allClasses && cache.allClasses.length > 0),
      updatedAt: cache.updatedAt,
      totalCachedClasses: cache.allClasses ? cache.allClasses.length : 0,
      cachedWeeks: Object.keys(cache.weeks || {}),
      classesFilePath: CLASSES_FILE,
    });
  });

  // 4. Schedule Grid Data
  app.get('/api/schedule', async (c) => {
    const dateParam = c.req.query('date') || getMondayOfWeek(new Date());
    const monday = getMondayOfWeek(dateParam);
    const forceRefresh = c.req.query('refresh') === 'true';

    if (!forceRefresh) {
      const cached = getCachedWeekSchedule(monday);
      if (cached) {
        return c.json({ ...cached, isCached: true, weekLabel: `${monday} to ${getSundayOfWeek(monday)}` });
      }
    }

    if (isForcedOffline) {
      const cached = getCachedWeekSchedule(monday);
      return c.json(
        cached
          ? { ...cached, isCached: true, weekLabel: `${monday} to ${getSundayOfWeek(monday)}` }
          : {
              monday,
              weekLabel: `${monday} to ${getSundayOfWeek(monday)}`,
              flexibleClasses: [],
              fixedClasses: [],
              summary: [],
              isCached: true,
              notice: 'Offline mode: Week not found in classes.json',
            }
      );
    }

    try {
      const schedule = await client.fetchSchedule({ date: monday, weekType: 'current' });
      saveWeekSchedule(monday, schedule);
      return c.json({ ...schedule, monday, isCached: false, weekLabel: `${monday} to ${getSundayOfWeek(monday)}` });
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const cached = getCachedWeekSchedule(monday);
      if (cached) {
        return c.json({
          ...cached,
          isCached: true,
          warning: `Live fetch failed (${message}). Using cached data.`,
          weekLabel: `${monday} to ${getSundayOfWeek(monday)}`,
        });
      }
      return c.json({ error: message }, 500);
    }
  });

  // 5. Live Fetch All
  app.post('/api/fetch-latest', async (c) => {
    try {
      await ensureAuthenticatedSession(client);
      await fetchAndCacheLiveSchedules(client);
      const cache = loadClassesData();
      return c.json({
        success: true,
        updatedAt: cache.updatedAt,
        totalClasses: cache.allClasses.length,
        weeks: Object.keys(cache.weeks),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Pre-Registrar] /api/fetch-latest error:', message);
      return c.json({ error: message }, 500);
    }
  });

  // 6. Get Target Courses
  app.get('/api/courses', (c) => {
    if (!existsSync(COURSES_FILE)) {
      return c.json([]);
    }
    return c.json(JSON.parse(readFileSync(COURSES_FILE, 'utf-8') || '[]'));
  });

  // 7. Save Target Courses
  app.post('/api/courses', async (c) => {
    const parsed = (await c.req.json().catch(() => ({}))) as { courses?: CourseCriteria[] } | CourseCriteria[];
    const coursesToSave = Array.isArray(parsed) ? parsed : parsed.courses;
    if (!Array.isArray(coursesToSave)) {
      return c.json({ error: 'Expected an array of courses.' }, 400);
    }

    writeFileSync(COURSES_FILE, JSON.stringify(coursesToSave, null, 2), 'utf-8');
    console.log(`💾 [Pre-Registrar] Saved ${coursesToSave.length} target course(s) to ${COURSES_FILE}`);
    return c.json({
      success: true,
      count: coursesToSave.length,
      filePath: COURSES_FILE,
      savedAt: new Date().toISOString(),
    });
  });

  // 8. Refresh Tokens
  app.post('/api/refresh-tokens', async (c) => {
    await client.refreshSession();
    return c.json({ success: true, accessTokenExpiresAt: loadTokens()?.accessTokenExpiresAt });
  });

  // 9. Browser Login
  app.post('/api/browser-login', async (c) => {
    const tokens = await performBrowserLogin();
    const isTokensObj = typeof tokens === 'object' && tokens !== null && 'accessToken' in tokens;
    const user = isTokensObj ? (tokens as AuthTokens).user : null;
    const expiresAt = isTokensObj ? (tokens as AuthTokens).accessTokenExpiresAt : null;
    return c.json({ success: true, user, expiresAt });
  });

  // 10. Dry Run Pre-flight
  app.post('/api/dry-run', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { courses?: CourseCriteria[]; week?: string };
      const targetCourses: CourseCriteria[] =
        body.courses || (existsSync(COURSES_FILE) ? JSON.parse(readFileSync(COURSES_FILE, 'utf-8')) : []);
      const planResult = await planCourseRegistrations(client, targetCourses, {
        week: body.week || WEEK_MODES.NEXT,
      });
      return c.json(planResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Pre-Registrar] /api/dry-run error:', message);
      return c.json({ error: message }, 500);
    }
  });

  // 11. Automated Registration Execution (Stage 1 Cancel -> Stage 2 Register)
  app.post('/api/auto-register', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        courses?: CourseCriteria[];
        week?: string;
        dryRun?: boolean;
        toCancelCourses?: CourseCriteria[];
      };

      const inlineCourses = Array.isArray(body.courses) ? body.courses : undefined;

      // Persist non-empty course selections to file so CLI runs can reuse them
      if (inlineCourses && inlineCourses.length > 0) {
        writeFileSync(COURSES_FILE, JSON.stringify(inlineCourses, null, 2), 'utf-8');
        console.log(`💾 [Pre-Registrar] Saved ${inlineCourses.length} courses to ${COURSES_FILE}`);
      }

      console.log(
        `🚀 [Pre-Registrar] Triggering automated registration pipeline for week: ${body.week || WEEK_MODES.NEXT}...`
      );
      const result = await runAutoRegister({
        file: COURSES_FILE,
        courses: inlineCourses,        // if passed as [], do not register courses
        week: body.week || WEEK_MODES.NEXT,
        dryRun: Boolean(body.dryRun),
        toCancelCourses: body.toCancelCourses || [],
      });
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Pre-Registrar] /api/auto-register error:', message);
      return c.json({ error: message }, 500);
    }
  });

  // 12. Cancel Registration (Single course)
  app.post('/api/cancel-registration', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { course?: CourseCriteria; week?: string };
      if (!body.course) {
        return c.json({ error: 'Missing course object to cancel.' }, 400);
      }

      console.log(
        `🚫 [Pre-Registrar] Requesting browser cancellation for: "${body.course.lesson}" on ${body.course.date}...`
      );
      const result = await cancelCourseInBrowser(body.course, { week: body.week || WEEK_MODES.NEXT });
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Pre-Registrar] /api/cancel-registration error:', message);
      return c.json({ error: message }, 500);
    }
  });

  // 13. Get Enrolled Classes
  app.get('/api/enrolled-classes', (c) => {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const store = loadEnrolledClassesData();
    let items = store.enrolledClasses || [];
    if (startDate && endDate) {
      items = items.filter((item) => {
        const date = item.flexibleClassSchedule?.date?.slice(0, 10);
        return date && date >= startDate && date <= endDate;
      });
    }
    return c.json({
      ...store,
      totalEnrolled: items.length,
      enrolledClasses: items,
      dateRange: startDate && endDate ? { startDate, endDate } : store.dateRange,
    });
  });

  // 14. Live Fetch Enrolled Classes
  app.post('/api/fetch-enrolled', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      startDate?: string;
      endDate?: string;
      type?: string;
      week?: string;
    };

    const thisMonday = getMondayOfWeek(new Date());
    const thisSunday = getSundayOfWeek(thisMonday);
    const startDate = body.startDate || thisMonday;
    const endDate = body.endDate || thisSunday;
    const type = body.type || 'All';

    try {
      await ensureAuthenticatedSession(client);
      console.log(`🌐 [Pre-Registrar] Fetching enrolled classes (${startDate} to ${endDate}, type=${type})...`);
      const response = await client.fetchRegisteredClasses({ startDate, endDate, type });
      const store = saveEnrolledClassesData(response, { startDate, endDate, type });
      const report = generateTeacherReport(store.enrolledClasses, { startDate, endDate });
      saveTeacherReport(report);

      return c.json({
        success: true,
        totalEnrolled: store.totalEnrolled,
        dateRange: store.dateRange,
        updatedAt: store.updatedAt,
        enrolledClasses: store.enrolledClasses,
        report,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Pre-Registrar] /api/fetch-enrolled live fetch failed:', message);
      const store = loadEnrolledClassesData();
      if (store.enrolledClasses && store.enrolledClasses.length > 0) {
        const report = generateTeacherReport(store.enrolledClasses, store.dateRange || { startDate, endDate });
        return c.json({
          success: true,
          isCached: true,
          warning: `Live fetch failed (${message}). Showing saved enrolled classes & teacher report. Set EMAIL and PASSWORD in .env to enable automatic campus sync.`,
          totalEnrolled: store.totalEnrolled,
          dateRange: store.dateRange || { startDate, endDate },
          updatedAt: store.updatedAt,
          enrolledClasses: store.enrolledClasses,
          report,
        });
      }
      return c.json({ error: message }, 500);
    }
  });

  // 15. Get Teacher Teaching Report
  app.get('/api/teacher-report', async (c) => {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const forceRefresh = c.req.query('refresh') === 'true';

    if (forceRefresh && startDate && endDate && !isForcedOffline) {
      try {
        await ensureAuthenticatedSession(client);
        const response = await client.fetchRegisteredClasses({ startDate, endDate, type: 'All' });
        saveEnrolledClassesData(response, { startDate, endDate, type: 'All' });
      } catch (err) {
        console.warn('[Pre-Registrar] Live refresh for /api/teacher-report failed:', err);
      }
    }

    const store = loadEnrolledClassesData();
    let items = store.enrolledClasses || [];
    if (startDate && endDate) {
      items = items.filter((item) => {
        const date = item.flexibleClassSchedule?.date?.slice(0, 10);
        return date && date >= startDate && date <= endDate;
      });
    }
    const dateRange = startDate && endDate
      ? { startDate, endDate }
      : store.dateRange
      ? { startDate: store.dateRange.startDate, endDate: store.dateRange.endDate }
      : undefined;
    const report = generateTeacherReport(items, dateRange);
    return c.json(report);
  });

  // 16. Import Enrolled Classes JSON
  app.post('/api/import-enrolled', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
      const rawData = body.raw || body.data || body;
      const flexibleClass = Array.isArray(rawData.flexibleClass)
        ? rawData.flexibleClass
        : Array.isArray(rawData)
        ? rawData
        : [];

      if (flexibleClass.length === 0) {
        return c.json({ error: 'No flexibleClass array found in provided payload.' }, 400);
      }

      const responseObj: RegisteredListResponse = {
        flexibleClass,
        scheduleClass: rawData.scheduleClass || [],
      };

      const startDate = body.startDate || rawData.startDate || '2026-08-17';
      const endDate = body.endDate || rawData.endDate || '2026-08-23';
      const store = saveEnrolledClassesData(responseObj, { startDate, endDate });
      const report = generateTeacherReport(store.enrolledClasses, { startDate, endDate });
      saveTeacherReport(report);

      return c.json({
        success: true,
        totalEnrolled: store.totalEnrolled,
        dateRange: store.dateRange,
        updatedAt: store.updatedAt,
        enrolledClasses: store.enrolledClasses,
        report,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // 17. Save Session Tokens
  app.post('/api/save-session-tokens', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
      const accessToken = body.accessToken;
      const refreshToken = body.refreshToken;
      if (!accessToken && !refreshToken) {
        return c.json({ error: 'accessToken or refreshToken is required.' }, 400);
      }
      const saved = saveTokens({ accessToken, refreshToken });
      return c.json({ success: true, tokens: saved });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // 18. Get Teacher Notes / Feedback
  app.get('/api/teacher-notes', (c) => {
    const notes = loadTeacherNotes();
    return c.json(notes);
  });

  // 19. Save / Update Teacher Note / Feedback
  app.post('/api/teacher-notes', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        teacherCode?: string;
        teacherName?: string;
        note?: string;
        rating?: number;
      };
      if (!body.teacherCode) {
        return c.json({ error: 'teacherCode is required' }, 400);
      }
      const notes = loadTeacherNotes();
      const code = body.teacherCode.trim();
      notes[code] = {
        teacherCode: code,
        teacherName: body.teacherName || notes[code]?.teacherName || '',
        note: (body.note || '').trim(),
        rating: body.rating ?? notes[code]?.rating ?? null,
        updatedAt: new Date().toISOString(),
      };
      saveTeacherNotes(notes);
      return c.json({ success: true, teacherCode: code, note: notes[code], notes });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // 20. Delete Teacher Note
  app.delete('/api/teacher-notes/:code', (c) => {
    const code = c.req.param('code')?.trim();
    if (!code) return c.json({ error: 'teacherCode is required' }, 400);
    const notes = loadTeacherNotes();
    if (notes[code]) {
      delete notes[code];
      saveTeacherNotes(notes);
    }
    return c.json({ success: true, notes });
  });

  const host = options.host || process.env.HOST || '0.0.0.0';
  const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    const localUrl = `http://localhost:${info.port}`;
    const networkIps = getLocalIpAddresses();

    console.log(`\n🌐 [Pre-Registrar Server] Running:`);
    console.log(`   ➜ Local:    \x1b[36m${localUrl}/\x1b[0m`);
    if (networkIps.length > 0) {
      for (const ip of networkIps) {
        console.log(`   ➜ Network:  \x1b[32mhttp://${ip}:${info.port}/\x1b[0m (devices on same Wi-Fi)`);
      }
    } else {
      console.log(`   ➜ Network:  \x1b[32mhttp://0.0.0.0:${info.port}/\x1b[0m`);
    }
    console.log(`   Classes Cache:       \x1b[35m${CLASSES_FILE}\x1b[0m`);
    console.log(`   Target Courses File: \x1b[33m${COURSES_FILE}\x1b[0m\n`);

    if (!options.noOpen) {
      const openCommand =
        process.platform === 'darwin'
          ? `open ${localUrl}`
          : process.platform === 'win32'
            ? `start ${localUrl}`
            : `xdg-open ${localUrl}`;
      exec(openCommand, () => {});
    }
  });

  return server;
}

/**
 * Main Runner.
 */
export async function runPreRegister(options: PreRegisterServerOptions = {}): Promise<ReturnType<typeof serve>> {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║           TalkFirst Interactive Course Pre-Registrar                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  const shouldBypassAndFetch = options.bypass || options.fetch || options.latest || options.sync;
  const isExplicitOffline = options.offline || options.cached || options.local;
  const cachedExists = hasCachedClasses();
  const client = new TalkFirstApiClient();

  if (shouldBypassAndFetch || (!cachedExists && !isExplicitOffline)) {
    console.log('🔄 Syncing schedule data from TalkFirst...\n');
    await ensureAuthenticatedSession(client);
    await fetchAndCacheLiveSchedules(client);
  } else {
    console.log('⚡ Using cached classes from classes.json for instant offline interaction.\n');
  }

  return startPreRegisterServer(options);
}

// ── CLI Dispatcher ──────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const flags = mri(process.argv.slice(2), {
    alias: { p: 'port', h: 'help', H: 'host' },
    boolean: ['offline', 'bypass', 'fetch', 'latest', 'sync', 'noOpen', 'help'],
    default: { port: DEFAULT_PRE_REGISTER_PORT, host: '0.0.0.0', noOpen: false },
  });

  if (flags.help) {
    console.log(`
TalkFirst Interactive Pre-Registrar UI Server

Usage: node src/pre-register.ts [options]
Options:
  --bypass, --fetch, --latest   Fetch latest classes from API and save to classes.json
  --offline, --cached, --local  Use classes in classes.json without connecting to external API
  --port, -p <number>           Server port (default: 3333)
  --host, -H <string>           Server host binding (default: 0.0.0.0 - accessible to LAN devices)
  --no-open                     Do not automatically open browser
`);
    process.exit(0);
  }

  runPreRegister(flags as PreRegisterServerOptions).catch((err) => {
    console.error('❌ Failed to start Pre-Registrar:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
