/**
 * auto-register.ts
 *
 * Master pipeline orchestrator for TalkFirst course auto-registration.
 *
 * 5-Step Pipeline:
 * 1. Verify Authentication & Token Validity
 * 2. Load Target Course Preferences
 * 3. Search Multi-Week Schedule & Validate Constraints
 * 4. Execute Browser Registration in Chrome via CDP
 * 5. Display Summary Table & Persist JSON Report
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import mri from 'mri';
import { TalkFirstApiClient } from './api-client.ts';
import { cancelCoursesInBrowser, registerCoursesInBrowser } from './browser-registrar.ts';
import { ensureBrowserSessionActive, performBrowserLogin } from './bypass.ts';
import { REGISTRATION_STATUS, STATUS_BADGES, WEEK_MODES } from './constants.ts';
import { hasTimeOverlap, normalize, planCourseRegistrations } from './course-matcher.ts';
import { decodeJwt, isTokenExpired, loadTokens, saveTokens } from './token-manager.ts';
import type {
  AuthTokens,
  AutoRegisterOptions,
  AutoRegisterRunResult,
  ClassSlot,
  CourseCriteria,
  CoursePlanningResult,
  RegistrationPlanItem,
  RegistrationReport,
  RegistrationResultItem,
} from './types.ts';

export {
  saveTokens,
  loadTokens,
  TalkFirstApiClient,
  performBrowserLogin,
  registerCoursesInBrowser,
  cancelCoursesInBrowser,
};

const currentDir = dirname(fileURLToPath(import.meta.url));

// ── Step 1: Authentication Verification (Single Tab) ─────────────────────────

async function step1_verifyAuthentication(
  client: TalkFirstApiClient,
  _options: AutoRegisterOptions = {}
): Promise<AuthTokens | null> {
  console.log('🔑 [Step 1/5] Verifying Chrome Authentication (using 1 tab)...');

  await ensureBrowserSessionActive();

  try {
    await client.ensureValidAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️  Session verification failed (${message}). Re-authenticating via 1 Chrome tab...\n`);
    await performBrowserLogin();
    await client.ensureValidAccessToken();
  }

  const active = loadTokens();
  console.log(`   ✅ Authenticated as: ${active?.user?.email || 'Student'}`);
  console.log(`   Access Token Expires: ${active?.accessTokenExpiresAt || 'N/A'}\n`);
  return active;
}

// ── Step 2: Load Target Preferences ─────────────────────────────────────────

function step2_loadTargetCourses(filePath: string): CourseCriteria[] {
  console.log('📋 [Step 2/5] Loading Target Course Preferences...');

  if (!existsSync(filePath)) {
    throw new Error(`Target courses file not found: ${filePath}`);
  }

  const courses = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(courses) || courses.length === 0) {
    throw new Error('Courses file must contain a non-empty array of course criteria.');
  }

  console.log(`   Loaded ${courses.length} course preference(s) from: ${filePath}\n`);
  return courses as CourseCriteria[];
}

// ── Step 3: Match Schedule & Build Plan ──────────────────────────────────────

async function step3_buildRegistrationPlan(
  client: TalkFirstApiClient,
  requestedCourses: CourseCriteria[],
  options: AutoRegisterOptions
): Promise<CoursePlanningResult> {
  console.log('🔍 [Step 3/5] Searching Schedules & Matching Classes...');

  const planResult = await planCourseRegistrations(client, requestedCourses, options);
  console.log(`   Target Schedule: ${planResult.targetWeekLabel || 'N/A'}`);
  console.log(`   Matches Found: ${planResult.availableCount}/${planResult.totalRequested} course(s) ready to book\n`);

  return planResult;
}

// ── Step 4: Execute Registrations ───────────────────────────────────────────

function getStatusBadge(status: string): string {
  return STATUS_BADGES[status] || status;
}

async function step4_executeRegistrations(
  _client: TalkFirstApiClient,
  planResult: CoursePlanningResult,
  options: AutoRegisterOptions = {}
): Promise<RegistrationResultItem[]> {
  console.log('⚡ [Step 4/5] Processing Class Registrations...');
  const results: RegistrationResultItem[] = [];
  const registeredInBatch: ClassSlot[] = [];
  const readyItems: RegistrationPlanItem[] = [];

  for (const item of planResult.plan) {
    const slot = item.selected;

    // Check pre-flight rejection
    if (item.status !== REGISTRATION_STATUS.READY && item.status !== REGISTRATION_STATUS.MULTIPLE_MATCHES) {
      results.push({
        status: getStatusBadge(item.status),
        lesson: slot?.lesson || item.request?.lesson || 'N/A',
        date: slot?.date || item.request?.date || 'N/A',
        time: (slot?.startTime || item.request?.startTime || item.request?.time || 'N/A').slice(0, 5),
        teacher:
          slot?.teacherNickName ||
          slot?.teacherName ||
          item.request?.teacher ||
          item.request?.teacherNickName ||
          item.request?.teacherName ||
          'N/A',
        room: slot?.room || 'N/A',
        message: item.reason,
      });
      continue;
    }

    if (!slot) {
      continue;
    }

    // Dynamic duplicate lesson topic check against batch
    const duplicate = registeredInBatch.find((r) => normalize(r.lesson) === normalize(slot.lesson));
    if (duplicate) {
      results.push({
        status: STATUS_BADGES[REGISTRATION_STATUS.DUPLICATE_TOPIC] || REGISTRATION_STATUS.DUPLICATE_TOPIC,
        lesson: slot.lesson,
        date: slot.date,
        time: slot.startTime.slice(0, 5),
        teacher: slot.teacherNickName || slot.teacherName || 'N/A',
        room: slot.room || 'N/A',
        message: `Duplicate class topic: "${slot.lesson}" was already scheduled/registered on ${duplicate.date}.`,
      });
      continue;
    }

    // Dynamic conflict check against previous items registered in this batch
    const conflict = registeredInBatch.find(
      (r) => r.date === slot.date && hasTimeOverlap(slot.startTime, slot.endTime, r.startTime, r.endTime)
    );
    if (conflict) {
      results.push({
        status: STATUS_BADGES[REGISTRATION_STATUS.TIME_CONFLICT] || REGISTRATION_STATUS.TIME_CONFLICT,
        lesson: slot.lesson,
        date: slot.date,
        time: slot.startTime.slice(0, 5),
        teacher: slot.teacherNickName || slot.teacherName || 'N/A',
        room: slot.room || 'N/A',
        message: `Conflict with "${conflict.lesson}" registered earlier in this batch.`,
      });
      continue;
    }

    readyItems.push(item);
    registeredInBatch.push(slot);
  }

  // Dry-run mode: report ready without booking
  if (options.dryRun && readyItems.length > 0) {
    for (const item of readyItems) {
      if (!item.selected) continue;
      results.push({
        status: STATUS_BADGES[REGISTRATION_STATUS.READY_DRY_RUN] || REGISTRATION_STATUS.READY_DRY_RUN,
        lesson: item.selected.lesson,
        date: item.selected.date,
        time: item.selected.startTime.slice(0, 5),
        teacher: item.selected.teacherNickName || item.selected.teacherName || 'N/A',
        room: item.selected.room || 'N/A',
        message: 'Validated and ready for browser registration.',
      });
    }
    return results;
  }

  // Execute Browser Registration in Chrome via CDP
  if (readyItems.length > 0) {
    console.log(
      `\n🚀 [Step 4/5] Calculated ${readyItems.length} course(s) ready to register. Spawning ${readyItems.length} concurrent tab(s) in Chrome...`
    );
    const payload: CourseCriteria[] = readyItems.map((it) => ({
      ...it.request,
      ...(it.selected || {}),
    }));
    const browserResults = await registerCoursesInBrowser(payload, options);
    results.push(...browserResults);
  } else {
    console.log(
      '\nℹ️ [Step 4/5] 0 courses eligible to register (all requested courses are either already enrolled, full, or have conflicts).'
    );
  }

  return results;
}

// ── Step 5: Render & Save Report ────────────────────────────────────────────

function step5_generateAndSaveReport(
  planResult: CoursePlanningResult | null,
  registrationResults: RegistrationResultItem[],
  userEmail?: string
): RegistrationReport {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     COURSE REGISTRATION REPORT                         ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  console.table(
    registrationResults.map((r) => ({
      Status: r.status,
      Date: r.date,
      Time: r.time,
      Lesson: r.lesson,
      Teacher: r.teacher,
      Room: r.room,
      Notes: r.message,
    }))
  );

  const report: RegistrationReport = {
    executedAt: new Date().toISOString(),
    studentEmail: userEmail || 'N/A',
    targetWeek: planResult?.targetWeek || WEEK_MODES.NEXT,
    targetWeekLabel: planResult?.targetWeekLabel || 'N/A',
    totalRequested: planResult?.totalRequested ?? 0,
    availableCount: planResult?.availableCount ?? 0,
    results: registrationResults,
  };

  const reportFile = resolve(currentDir, '../last-registration-report.json');
  writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📄 Detailed JSON report saved to: ${reportFile}\n`);

  return report;
}

// ── Main Pipeline Runner ────────────────────────────────────────────────────

export async function runAutoRegister(options: AutoRegisterOptions = {}): Promise<AutoRegisterRunResult> {
  const coursesFile = options.file ? resolve(process.cwd(), options.file) : resolve(currentDir, '../courses.json');

  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║               TalkFirst Smart Course Auto-Registrar                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  if (options.fillOnly || options.noSubmit || options.justFill) {
    console.log('🌐 [Browser Fill Mode] Launching Chrome to fill credentials without logging in...');
    await performBrowserLogin({ noSubmit: true, fillOnly: true });
    console.log('✅ Credentials filled into Chrome login form. Browser left open on TalkFirst portal.');
    return { success: true };
  }

  const client = new TalkFirstApiClient();

  // 1. Process login
  const activeTokens = await step1_verifyAuthentication(client, options);

  let cancelResults: RegistrationResultItem[] = [];
  // 2. Cancellation Stage
  if (options.toCancelCourses && Array.isArray(options.toCancelCourses) && options.toCancelCourses.length > 0) {
    console.log(
      `\n🗑️ [Stage 1/2: Cancellation] Spawning ${options.toCancelCourses.length} concurrent tab(s) to close classes first...`
    );
    cancelResults = await cancelCoursesInBrowser(options.toCancelCourses, options);
    console.log(`✅ [Stage 1/2] Finished cancellation for ${cancelResults.length} class(es).\n`);
  }

  // 3. Determine course list: prefer inline courses (even if empty); fall back to file ONLY when options.courses is undefined and not cancel-only
  let courseList: CourseCriteria[] = [];
  if (Array.isArray(options.courses)) {
    courseList = options.courses;
    if (courseList.length > 0) {
      console.log(`📋 [Step 2/5] Using ${courseList.length} inline course criteria from request body.`);
    }
  } else if (!options.toCancelCourses || options.toCancelCourses.length === 0) {
    // Only load from file if options.courses was omitted AND this is not a cancel-only run
    const hasFile = coursesFile && existsSync(coursesFile);
    const fileData = hasFile ? JSON.parse(readFileSync(coursesFile, 'utf-8')) : [];
    if (Array.isArray(fileData) && fileData.length > 0) {
      console.log(`📋 [Step 2/5] Loaded ${fileData.length} course criteria from file: ${coursesFile}`);
      courseList = fileData as CourseCriteria[];
    }
  }

  let registrationResults: RegistrationResultItem[] = [];
  let planResult: CoursePlanningResult | null = null;

  if (courseList.length > 0) {
    // 4. Fetch updated schedule and match with criteria
    planResult = await step3_buildRegistrationPlan(client, courseList, options);

    // 5. Register eligible slots
    registrationResults = await step4_executeRegistrations(client, planResult, options);
  } else {
    console.log('ℹ️ [Step 2/5] No courses to register — skipping schedule match and registration steps.');
  }

  // Combine cancel & registration results in report
  const combinedResults = [...cancelResults, ...registrationResults];

  // 6. Save & output summary report
  const report = step5_generateAndSaveReport(planResult, combinedResults, activeTokens?.user?.email);

  return { success: true, report, cancelResults, registrationResults };
}

// ── CLI Dispatcher ──────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
TalkFirst Smart Course Auto-Registrar CLI

Usage:
  node src/auto-register.ts [options]

Options:
  --week, -w <next|this|all>  Target week schedule (default: next)
  --this-week                Shorthand for --week this
  --next-week                Shorthand for --week next (default)
  --all-weeks                Shorthand for --week all
  --file, -f <path>          Path to courses JSON file (default: courses.json)
  --dry-run                  Dry-run validation check without booking
  --date, -d <YYYY-MM-DD>    Target explicit anchor date
  --status, -s               Check active authentication status
  --refresh, -r              Manually refresh authentication tokens
  --help, -h                 Display help information

Examples:
  yarn start               # Register target courses for NEXT week
  yarn start:this          # Register target courses for THIS week
  yarn dry-run             # Validate criteria without registering
  yarn status              # View current login status
`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const flags = mri(process.argv.slice(2), {
    alias: { f: 'file', d: 'date', w: 'week', s: 'status', r: 'refresh', h: 'help' },
    boolean: [
      'dryRun',
      'dry-run',
      'browser',
      'fillOnly',
      'noSubmit',
      'status',
      'refresh',
      'help',
      'this-week',
      'next-week',
      'all-weeks',
    ],
  });

  if (flags['this-week']) flags.week = 'this';
  if (flags['next-week']) flags.week = 'next';
  if (flags['all-weeks']) flags.week = 'all';
  if (flags['dry-run']) flags.dryRun = true;

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  if (flags.status) {
    const tokens = loadTokens();
    if (!tokens) {
      console.log('❌ No saved session in .tokens.json.');
    } else {
      console.log('📋 Current Authentication Status:');
      console.log('---------------------------------');
      console.log('User Email:           ', tokens.user?.email || 'N/A');
      console.log('Access Token Valid:   ', !isTokenExpired(tokens.accessToken, 0) ? '✅ Yes' : '❌ Expired');
      console.log('Access Token Expires: ', tokens.accessTokenExpiresAt || 'N/A');
    }
    process.exit(0);
  }

  if (flags.refresh) {
    const client = new TalkFirstApiClient();
    console.log('🔄 Refreshing authentication tokens...');
    client
      .refreshSession()
      .then((t) => {
        console.log('✅ Tokens refreshed successfully!');
        const payload = decodeJwt(t.accessToken);
        console.log(
          'New Access Token Expiry:',
          payload?.exp ? new Date(payload.exp * 1000).toLocaleString() : 'N/A'
        );
        process.exit(0);
      })
      .catch((err) => {
        console.error('❌ Token refresh failed:', err instanceof Error ? err.message : err);
        process.exit(1);
      });
  } else {
    runAutoRegister(flags as AutoRegisterOptions)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('❌ Execution failed:', err instanceof Error ? err.message : err);
        process.exit(1);
      });
  }
}
