/**
 * enrolled-classes.ts
 *
 * CLI orchestrator for fetching student enrolled classes from TalkFirst API
 * and generating teacher-to-classes teaching reports.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mri from 'mri';

import { TalkFirstApiClient } from './api-client.ts';
import { ensureBrowserSessionActive, performBrowserLogin } from './bypass.ts';
import { getMondayOfWeek, getSundayOfWeek } from './course-matcher.ts';
import {
  generateTeacherReport,
  hasCachedEnrolledClasses,
  loadEnrolledClassesData,
  printTeacherReportConsole,
  saveEnrolledClassesData,
  saveTeacherReport,
} from './enrolled-classes-manager.ts';
import { loadTokens } from './token-manager.ts';
import type { EnrolledClassesOptions, RegisteredListResponse, TeacherTeachingReport } from './types.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Resolves start and end date based on CLI options.
 */
export function resolveDateRange(options: EnrolledClassesOptions = {}): { startDate: string; endDate: string } {
  if (options.startDate && options.endDate) {
    return { startDate: options.startDate, endDate: options.endDate };
  }

  const now = new Date();

  if (options.month || options.thisMonth) {
    const y = now.getFullYear();
    const m = now.getMonth();
    const lastDay = new Date(y, m + 1, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = `${y}-${pad(m + 1)}-01`;
    const endDate = `${y}-${pad(m + 1)}-${pad(lastDay.getDate())}`;
    return { startDate, endDate };
  }

  const thisMonday = getMondayOfWeek(now);
  const thisSunday = getSundayOfWeek(thisMonday);

  const [ty, tm, td] = thisMonday.split('-').map(Number);
  const nextMondayDate = new Date(ty, tm - 1, td + 7);
  const nextMonday = getMondayOfWeek(nextMondayDate);
  const nextSunday = getSundayOfWeek(nextMonday);

  const weekMode = String(
    options.week || (options.thisWeek ? 'this' : '') || (options.nextWeek ? 'next' : '') || 'this'
  ).toLowerCase();

  if (weekMode === 'next') {
    return { startDate: nextMonday, endDate: nextSunday };
  }

  if (weekMode === 'month') {
    const y = now.getFullYear();
    const m = now.getMonth();
    const lastDay = new Date(y, m + 1, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = `${y}-${pad(m + 1)}-01`;
    const endDate = `${y}-${pad(m + 1)}-${pad(lastDay.getDate())}`;
    return { startDate, endDate };
  }

  return { startDate: thisMonday, endDate: thisSunday };
}

/**
 * Runs the enrolled classes fetcher and report generator.
 */
export async function runEnrolledClasses(
  options: EnrolledClassesOptions = {}
): Promise<{ report: TeacherTeachingReport; response?: RegisteredListResponse }> {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║             TalkFirst Enrolled Classes & Teacher Report                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  const { startDate, endDate } = resolveDateRange(options);
  const type = options.type || 'All';
  const isOffline = Boolean(options.offline);

  let response: RegisteredListResponse | undefined;

  if (!isOffline) {
    console.log(`🔍 [1/3] Fetching enrolled classes from TalkFirst API (${startDate} to ${endDate})...`);
    const client = new TalkFirstApiClient();

    try {
      await ensureBrowserSessionActive();
      await client.ensureValidAccessToken();
    } catch (authErr) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      console.warn(`   ⚠️ Auth token issue (${msg}). Launching browser session login...`);
      await performBrowserLogin();
      await client.ensureValidAccessToken();
    }

    try {
      response = await client.fetchRegisteredClasses({ startDate, endDate, type });
      saveEnrolledClassesData(response, { startDate, endDate, type });
      console.log(`   ✅ Successfully fetched ${response.flexibleClass?.length ?? 0} enrolled class(es).\n`);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.warn(`   ⚠️ Live fetch failed: ${msg}`);
      if (hasCachedEnrolledClasses()) {
        console.log('   ⚡ Falling back to cached enrolled classes in enrolled-classes.json...\n');
      } else {
        throw fetchErr;
      }
    }
  } else {
    console.log('⚡ [1/3] Offline Mode: Using cached data from enrolled-classes.json...\n');
  }

  // 2. Load stored data
  console.log('📊 [2/3] Processing enrolled classes and aggregating teachers...');
  const store = loadEnrolledClassesData();
  let itemsToReport = store.enrolledClasses;
  let effectiveRange: { startDate: string; endDate: string } | undefined = { startDate, endDate };

  if (options.all) {
    effectiveRange = undefined;
  } else if (startDate && endDate) {
    itemsToReport = itemsToReport.filter((item) => {
      const d = item.flexibleClassSchedule?.date?.slice(0, 10);
      return d && d >= startDate && d <= endDate;
    });
  }

  // 3. Generate teacher report
  const report = generateTeacherReport(itemsToReport, effectiveRange);

  // 4. Save Markdown & JSON reports
  console.log('💾 [3/3] Saving detailed reports...');
  saveTeacherReport(report);

  // 5. Display Console Table
  printTeacherReportConsole(report);

  return { report, response };
}

function printHelp(): void {
  console.log(`
TalkFirst Enrolled Classes & Teacher Report CLI

Usage:
  node src/enrolled-classes.ts [options]

Options:
  --this-week                  Fetch enrolled classes for current week (Monday to Sunday)
  --next-week                  Fetch enrolled classes for next week (Monday to Sunday)
  --month, -m, --this-month    Fetch/report enrolled classes for the entire current month
  --all, -a                    Report across all stored dates in cache
  --start-date, -s <YYYY-MM-DD> Custom start date
  --end-date, -e <YYYY-MM-DD>   Custom end date
  --type, -t <string>          Enrollment type (default: InProgressVsWaiting)
  --offline, -o                Use local cache without API network calls
  --report, -r                 Generate and display teacher teaching report
  --help, -h                   Display help information

Examples:
  yarn enrolled                # Fetch current week enrolled classes & generate report
  yarn enrolled:this           # Fetch this week's enrolled classes
  yarn enrolled:next           # Fetch next week's enrolled classes
  yarn enrolled:month          # Fetch full month enrolled classes & generate report
  yarn enrolled:offline        # Generate report from cached classes
  yarn teachers                # Display teacher classes report from cache
`);
}

// ── CLI Dispatcher ──────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const flags = mri(process.argv.slice(2), {
    alias: { s: 'start-date', e: 'end-date', t: 'type', w: 'week', o: 'offline', r: 'report', m: 'month', a: 'all', h: 'help' },
    boolean: ['this-week', 'next-week', 'month', 'this-month', 'all', 'offline', 'report', 'json', 'help'],
    string: ['start-date', 'end-date', 'type', 'week'],
  });

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const options: EnrolledClassesOptions = {
    startDate: flags['start-date'] || flags.s,
    endDate: flags['end-date'] || flags.e,
    type: flags.type || flags.t,
    week: flags.week || flags.w,
    thisWeek: flags['this-week'],
    nextWeek: flags['next-week'],
    month: flags.month || flags['this-month'] || flags.m,
    thisMonth: flags['this-month'] || flags.month || flags.m,
    all: flags.all || flags.a,
    offline: flags.offline || flags.o,
    report: flags.report || flags.r,
    json: flags.json,
  };

  runEnrolledClasses(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Failed to process enrolled classes:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
