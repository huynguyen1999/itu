/**
 * browser-registrar.ts
 *
 * Automated UI registration & cancellation engine for TalkFirst via Playwright CDP:
 * 1. Connects to Chrome with CDP on port 9223.
 * 2. Navigates to /my-schedule/ and selects the target week.
 * 3. Pinpoints & hovers the exact class slot for each target course.
 * 4. Clicks "REGISTER" / "CANCEL", solves Cloudflare Turnstile in the modal, and clicks Confirm.
 * 5. Captures the result for the summary report.
 */

import type { BrowserContext, Page } from 'playwright';
import { connectToChrome, performBrowserLogin } from './bypass.ts';
import {
  API_ROUTES,
  DEFAULT_TALKFIRST_BASE_URL,
  REGISTRATION_STATUS,
  SELECTORS,
  TIMEOUTS,
  WEB_ROUTES,
  WEEK_MODES,
} from './constants.ts';
import { loadTokens } from './token-manager.ts';
import type {
  BrowserRegisterOptions,
  CourseCriteria,
  RegistrationResultItem,
} from './types.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ── Turnstile Solver ────────────────────────────────────────────────────────

/**
 * Waits for or clicks the Cloudflare Turnstile checkbox in the active modal.
 */
async function solveTurnstile(page: Page, maxTimeoutMs = TIMEOUTS.TURNSTILE_MODAL_TIMEOUT_MS): Promise<string | null> {
  const deadline = Date.now() + maxTimeoutMs;

  while (Date.now() < deadline) {
    const token = await page.evaluate((selector) => {
      const el = document.querySelector<HTMLInputElement>(selector);
      return el?.value || null;
    }, SELECTORS.TURNSTILE_RESPONSE_INPUT);

    if (token && token.length > 10) {
      return token;
    }

    for (const frame of page.frames()) {
      if (!frame.url().includes(SELECTORS.TURNSTILE_FRAME_HOST)) {
        continue;
      }
      try {
        const checkbox = frame.locator(SELECTORS.TURNSTILE_CHECKBOX);
        if (await checkbox.isVisible().catch(() => false)) {
          const box = await checkbox.boundingBox();
          if (box) {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            await page.mouse.move(cx + randomRange(10, 30), cy + randomRange(5, 15), { steps: 4 });
            await sleep(randomRange(50, 100));
            await page.mouse.click(cx, cy);
          } else {
            await checkbox.click({ force: true }).catch(() => {});
          }
        }
      } catch {}
    }

    await sleep(TIMEOUTS.TURNSTILE_POLL_INTERVAL_MS);
  }

  return null;
}

// ── Schedule Grid Locator & Hover Engine ─────────────────────────────────────

interface LocateSlotResult {
  found: boolean;
  message?: string;
  dayText?: string;
  timeText?: string;
  dayIndex?: number | null;
}

function calculateDayIndex(targetDate?: string): number | null {
  if (!targetDate) return null;
  const [y, m, d] = targetDate.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  const dateObj = new Date(y, m - 1, d);
  const jsDay = dateObj.getDay();
  return (jsDay + 6) % 7; // Monday = 0, Sunday = 6
}

async function extractPopoverText(page: Page): Promise<string> {
  return await page.evaluate((selectors) => {
    for (const s of selectors) {
      const el = document.querySelector<HTMLElement>(s);
      if (el && el.innerText && el.innerText.trim().length > 0) {
        return el.innerText;
      }
    }
    return '';
  }, SELECTORS.POPOVER_SEARCH_ELEMENTS);
}

/**
 * Locates the exact class slot on the timetable grid, triggers mouseenter & React onMouseEnter,
 * and reveals the registration popover.
 */
async function locateAndRevealPopover(page: Page, course: CourseCriteria): Promise<LocateSlotResult> {
  const targetTime = (course.startTime || course.time || '').slice(0, 5);
  const targetDate = course.date || '';
  const lessonInfo = course.lessonInfo as { lesson?: string } | undefined;
  const lessonTitle = (course.lesson || lessonInfo?.lesson || '').trim();
  const dayIndex = calculateDayIndex(targetDate);

  if (!targetTime || dayIndex === null) {
    return { found: false, message: 'Invalid target date or time slot' };
  }

  const rowLocator = page.locator(SELECTORS.SCHEDULE_GRID_ROW).filter({ hasText: targetTime }).first();
  if (!(await rowLocator.isVisible({ timeout: TIMEOUTS.ROW_LOCATE_TIMEOUT_MS }).catch(() => false))) {
    return { found: false, message: `Time slot row (${targetTime}) not found on grid` };
  }

  const cellLocator = rowLocator.locator(SELECTORS.SCHEDULE_GRID_CELL).nth(dayIndex);
  if (!(await cellLocator.isVisible({ timeout: TIMEOUTS.CELL_LOCATE_TIMEOUT_MS }).catch(() => false))) {
    return { found: false, message: `Day column #${dayIndex} not found in row ${targetTime}` };
  }

  await cellLocator.scrollIntoViewIfNeeded().catch(() => {});

  const wrapperCount = await cellLocator.locator(SELECTORS.SCHEDULE_CARD_WRAPPER).count();
  if (wrapperCount === 0) {
    return { found: false, message: 'No class cards in this grid slot' };
  }

  for (let idx = 0; idx < wrapperCount; idx++) {
    const wrapper = cellLocator.locator(SELECTORS.SCHEDULE_CARD_WRAPPER).nth(idx);
    const hasCursorPointer = (await wrapper.locator(SELECTORS.SCHEDULE_CURSOR_POINTER).count()) > 0;
    if (!hasCursorPointer) continue;

    await wrapper.evaluate((el: any) => {
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
      const propsKey = Object.keys(el).find((k) => k.startsWith('__reactProps'));
      if (propsKey && el[propsKey]?.onMouseEnter) {
        try {
          el[propsKey].onMouseEnter({
            currentTarget: el,
            target: el,
            preventDefault: () => {},
            stopPropagation: () => {},
          });
        } catch {}
      }
    });

    await sleep(TIMEOUTS.POPOVER_HOVER_DELAY_MS);

    const popoverText = await page.evaluate((selector) => {
      const el = document.querySelector<HTMLElement>(selector);
      return el ? el.innerText : '';
    }, SELECTORS.POPOVER_PORTAL);

    if (lessonTitle && popoverText) {
      if (popoverText.toLowerCase().includes(lessonTitle.toLowerCase())) {
        break;
      }
    } else if (popoverText) {
      break;
    }
  }

  const popoverLocator = page.locator(SELECTORS.POPOVER_PORTAL).first();
  const popoverVisible = await popoverLocator.isVisible({ timeout: TIMEOUTS.POPOVER_VISIBILITY_TIMEOUT_MS }).catch(() => false);

  if (!popoverVisible) {
    const cardEl = cellLocator.locator(SELECTORS.SCHEDULE_CURSOR_POINTER).first();
    await cardEl.click({ force: true }).catch(() => {});
    await sleep(400);
  }

  return { found: true, dayText: targetDate, timeText: targetTime, dayIndex };
}

// ── Single Class Registration Flow ──────────────────────────────────────────

interface SingleCourseResponseSummary {
  status?: number;
  data?: { message?: string; error?: string; [key: string]: unknown };
}

/**
 * Handles hover, popover validation, Turnstile solve, and registration submission for one course.
 */
async function registerSingleCourse(
  page: Page,
  course: CourseCriteria,
  options: BrowserRegisterOptions = {}
): Promise<RegistrationResultItem> {
  const lesson = course.lesson || 'Requested Course';
  const date = course.date || 'N/A';
  const time = (course.startTime || course.time || 'N/A').slice(0, 5);
  const teacher = course.teacherNickName || course.teacherName || course.teacher || 'N/A';
  const room = course.room || 'N/A';

  console.log(`\n   🔍 [Browser] Targeting: "${lesson}" on ${date} (${time})...`);

  // 1. Locate slot and trigger popover
  const outcome = await locateAndRevealPopover(page, course);
  if (!outcome.found) {
    console.log(`   ❌ [Browser] ${outcome.message || 'Slot not found on grid.'}`);
    return {
      status: REGISTRATION_STATUS.NOT_FOUND,
      lesson,
      date,
      time,
      teacher,
      room,
      message: outcome.message || 'Course slot not found on schedule.',
    };
  }

  // 2. Extract popover text
  const popoverText = await extractPopoverText(page);
  if (!popoverText) {
    return {
      status: REGISTRATION_STATUS.HOVER_FAILED,
      lesson,
      date,
      time,
      teacher,
      room,
      message: 'Could not reveal class popover on hover.',
    };
  }

  // 3. Check enrollment & capacity status from popover
  const isEnrolled = popoverText.toUpperCase().includes('ENROLLED') || popoverText.includes('📌');
  if (isEnrolled) {
    console.log(`   📌 [Browser] Already enrolled in: "${lesson}"`);
    return {
      status: REGISTRATION_STATUS.ALREADY_ENROLLED,
      lesson,
      date,
      time,
      teacher,
      room,
      message: 'Already enrolled in this class.',
    };
  }

  const regBtn = page.locator(SELECTORS.REGISTER_BUTTON).filter({ hasText: /REGISTER|Đăng ký/i }).first();
  const hasRegBtn = await regBtn.isVisible({ timeout: 2500 }).catch(() => false);

  if (!hasRegBtn) {
    const isClosedOrFull =
      popoverText.toUpperCase().includes('FULL') ||
      popoverText.toUpperCase().includes('CLOSED') ||
      popoverText.includes('🚫');
    if (isClosedOrFull) {
      console.log(`   🚫 [Browser] Class is closed/full: "${lesson}"`);
      return {
        status: REGISTRATION_STATUS.CLASS_FULL,
        lesson,
        date,
        time,
        teacher,
        room,
        message: 'Class slot is closed or capacity is full.',
      };
    }
    return {
      status: REGISTRATION_STATUS.REGISTER_BUTTON_MISSING,
      lesson,
      date,
      time,
      teacher,
      room,
      message: 'Register button did not appear in popover dialog.',
    };
  }

  // 4. Click REGISTER button in popover
  console.log(`   👉 [Browser] Clicking "REGISTER"...`);
  await regBtn.click({ timeout: TIMEOUTS.BUTTON_CLICK_TIMEOUT_MS, force: true }).catch((err) => {
    console.warn(`   [Browser] Register click warning: ${err instanceof Error ? err.message : err}`);
  });
  await sleep(1000);

  // 5. Attach response listener early (before Turnstile) so we don't miss any API response
  const apiRequests: Array<{ url: string; method: string; status: number; data?: any }> = [];
  const responseHandler = async (res: any) => {
    const url = res.url();
    const method = res.request().method();
    if (
      url.includes('/api/') &&
      (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
    ) {
      try {
        const json = await res.json();
        apiRequests.push({ url, method, status: res.status(), data: json });
      } catch {
        apiRequests.push({ url, method, status: res.status() });
      }
    }
  };
  page.on('response', responseHandler);

  // 6. Solve Turnstile in modal
  console.log('   🛡️ [Browser] Solving Cloudflare Turnstile in modal...');
  const token = await solveTurnstile(page, TIMEOUTS.TURNSTILE_MODAL_TIMEOUT_MS);
  if (token) {
    console.log('   ✅ [Browser] Turnstile solved successfully!');
  } else {
    console.warn('   ⚠️ [Browser] Turnstile timed out — submitting anyway, server may reject...');
  }

  // 7. Handle Dry-Run
  if (options.dryRun) {
    console.log('   🧪 [Browser] Dry-run mode: Closing modal without clicking Confirm.');
    page.off('response', responseHandler);
    const cancelBtn = page.locator(SELECTORS.MODAL_DISMISS_BUTTON).first();
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click({ timeout: 3000 }).catch(() => {});
    }
    return {
      status: REGISTRATION_STATUS.READY_DRY_RUN,
      lesson,
      date,
      time,
      teacher,
      room,
      message: 'Verified in browser: Ready to register.',
    };
  }

  // 8. Submit registration by clicking Confirm

  console.log('   🚀 [Browser] Clicking "Confirm" to submit registration...');
  const modalDialog = page.locator(SELECTORS.MODAL_DIALOG).first();
  const confirmBtn = page
    .locator(SELECTORS.MODAL_CONFIRM_BUTTON)
    .filter({ hasNot: page.locator('button[aria-label="Close"], button:has-text("✕")') })
    .first();

  if (await confirmBtn.isVisible({ timeout: TIMEOUTS.BUTTON_CLICK_TIMEOUT_MS }).catch(() => false)) {
    await confirmBtn.click({ timeout: TIMEOUTS.BUTTON_CLICK_TIMEOUT_MS, force: true }).catch((err) => {
      console.warn(`   [Browser] Confirm click warning: ${err instanceof Error ? err.message : err}`);
    });
  } else {
    // Fallback: click submit button
    const submitBtn = modalDialog.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click({ force: true }).catch(() => {});
    } else {
      page.off('response', responseHandler);
      return {
        status: REGISTRATION_STATUS.CONFIRM_BUTTON_MISSING,
        lesson,
        date,
        time,
        teacher,
        room,
        message: 'Confirm button did not appear in modal dialog.',
      };
    }
  }

  // Wait for API response or modal close
  await Promise.race([
    modalDialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MODAL_CLOSE_TIMEOUT_MS }).catch(() => {}),
    sleep(3500),
  ]);
  await sleep(1000);

  page.off('response', responseHandler);

  // 8. Evaluate result from API response, toast notification, and grid state
  const successfulApi = apiRequests.find((r) => r.status >= 200 && r.status < 300);
  const errorApi = apiRequests.find((r) => r.status >= 400);

  const toastText = await page.evaluate((selector) => {
    const toast = document.querySelector<HTMLElement>(selector);
    return toast ? toast.innerText : null;
  }, SELECTORS.TOAST_CONTAINER);

  const isToastSuccess =
    toastText &&
    (toastText.toLowerCase().includes('thành công') ||
      toastText.toLowerCase().includes('success') ||
      toastText.toLowerCase().includes('đã đăng ký') ||
      toastText.toLowerCase().includes('registered'));

  const isToastError =
    toastText &&
    (toastText.toLowerCase().includes('fail') ||
      toastText.toLowerCase().includes('error') ||
      toastText.toLowerCase().includes('thất bại') ||
      toastText.toLowerCase().includes('đủ số lượng') ||
      toastText.toLowerCase().includes('trùng'));

  // 1st Priority: Successful API response or success toast
  if (successfulApi || isToastSuccess) {
    const successMsg = toastText || successfulApi?.data?.message || 'Registered successfully via API submission!';
    console.log(`   🎉 [Browser] Successfully registered: "${lesson}"! (${successMsg})`);
    return {
      status: REGISTRATION_STATUS.REGISTERED,
      lesson,
      date,
      time,
      teacher,
      room,
      message: successMsg,
      response: successfulApi?.data,
    };
  }

  // 2nd Priority: Error API response or error toast
  if (errorApi || isToastError) {
    const errMsg =
      errorApi?.data?.message ||
      errorApi?.data?.error ||
      toastText ||
      `Registration rejected by server (HTTP ${errorApi?.status}).`;
    console.warn(`   ❌ [Browser] Registration rejected: ${errMsg}`);
    return {
      status: REGISTRATION_STATUS.REGISTRATION_FAILED,
      lesson,
      date,
      time,
      teacher,
      room,
      message: errMsg,
      response: errorApi?.data,
    };
  }

  // 3rd Priority: Check if modal closed cleanly without error
  const modalStillOpen = await modalDialog.isVisible().catch(() => false);
  if (!modalStillOpen) {
    console.log(`   🎉 [Browser] Modal closed without errors: "${lesson}" registered!`);
    return {
      status: REGISTRATION_STATUS.REGISTERED,
      lesson,
      date,
      time,
      teacher,
      room,
      message: toastText || 'Registration submitted and dialog closed.',
    };
  }

  // If modal still open and no API responses captured
  console.warn(`   ❌ [Browser] Registration modal remained open after submit.`);
  return {
    status: REGISTRATION_STATUS.REGISTRATION_FAILED,
    lesson,
    date,
    time,
    teacher,
    room,
    message: 'Registration dialog remained open after submit.',
  };
}

// ── Multi-Tab Concurrent Worker ──────────────────────────────────────────────

async function runCourseRegistrationInTab(
  context: BrowserContext,
  course: CourseCriteria,
  options: BrowserRegisterOptions,
  targetWeek: string,
  tabIndex: number
): Promise<RegistrationResultItem> {
  const page = await context.newPage();
  const lesson = course.lesson || 'Requested Course';

  try {
    console.log(`   📑 [Tab #${tabIndex + 1}] Opening schedule for: "${lesson}"...`);
    await page.goto(`${DEFAULT_TALKFIRST_BASE_URL}${WEB_ROUTES.MY_SCHEDULE}`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_SCHEDULE_NAVIGATION_MS,
    });

    await page.waitForSelector(SELECTORS.SCHEDULE_WEEK_BUTTON, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});

    // Switch to target week
    const isThisWeek = targetWeek === WEEK_MODES.THIS || targetWeek === 'current' || options.thisWeek;
    const weekButtonText = isThisWeek ? 'This Week' : 'Next Week';

    const weekBtn = page.locator(`button:has-text("${weekButtonText}")`).first();
    if (await weekBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await weekBtn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});
      await sleep(600);
    }

    // Ensure "All" filter is active
    const allBtn = page.locator(SELECTORS.SCHEDULE_ALL_FILTER_BUTTON).first();
    if (await allBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allBtn.click({ timeout: 3000 }).catch(() => {});
      await sleep(300);
    }

    const result = await registerSingleCourse(page, course, options);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`   ❌ [Tab #${tabIndex + 1} Error] "${lesson}": ${message}`);
    return {
      status: REGISTRATION_STATUS.TAB_ERROR,
      lesson,
      date: course.date || 'N/A',
      time: (course.startTime || course.time || 'N/A').slice(0, 5),
      teacher: course.teacherNickName || course.teacherName || 'N/A',
      room: course.room || 'N/A',
      message,
    };
  } finally {
    await sleep(TIMEOUTS.TAB_DISPOSAL_DELAY_MS);
    await page.close().catch(() => {});
  }
}

/**
 * Orchestrates browser connection, schedule navigation, and course registrations.
 * Spawns concurrent browser tabs in parallel for each requested course.
 */
export async function registerCoursesInBrowser(
  requestedCourses: CourseCriteria[] = [],
  options: BrowserRegisterOptions = {}
): Promise<RegistrationResultItem[]> {
  console.log('🌐 [Browser Registrar] Initializing Chrome session...');

  const tokens = loadTokens();
  if (!tokens?.accessToken) {
    console.log('   [Browser] No active session found. Logging in...');
    await performBrowserLogin();
  }

  const browser = await connectToChrome();
  const context = browser.contexts()[0] || (await browser.newContext());
  const targetWeek = (options.week || options.weekType || WEEK_MODES.NEXT).toLowerCase();

  if (requestedCourses.length === 0) {
    return [];
  }

  console.log(`🚀 [Browser Registrar] Spawning ${requestedCourses.length} concurrent tab(s) for parallel registration...`);
  const promises = requestedCourses.map((course, idx) =>
    runCourseRegistrationInTab(context, course, options, targetWeek, idx)
  );

  const settled = await Promise.allSettled(promises);
  return settled.map((result, idx) => {
    if (result.status === 'fulfilled') return result.value;
    const course = requestedCourses[idx];
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.warn(`   ❌ [Tab #${idx + 1} Fatal] Unhandled rejection: ${message}`);
    return {
      status: REGISTRATION_STATUS.TAB_ERROR,
      lesson: course.lesson || 'N/A',
      date: course.date || 'N/A',
      time: (course.startTime || course.time || 'N/A').slice(0, 5),
      teacher: course.teacherNickName || course.teacherName || 'N/A',
      room: course.room || 'N/A',
      message,
    } satisfies RegistrationResultItem;
  });
}

// ── Course Cancellation ─────────────────────────────────────────────────────

async function runSingleCourseCancellationInTab(
  context: BrowserContext,
  course: CourseCriteria,
  options: BrowserRegisterOptions,
  targetWeek: string,
  tabIndex: number
): Promise<RegistrationResultItem> {
  const page = await context.newPage();
  const lessonInfo = course.lessonInfo as { lesson?: string } | undefined;
  const lesson = course.lesson || lessonInfo?.lesson || 'Enrolled Course';
  const date = course.date || 'N/A';
  const time = (course.startTime || course.time || '').slice(0, 5);

  try {
    console.log(`   📑 [Cancel Tab #${tabIndex + 1}] Opening schedule to cancel: "${lesson}" on ${date} (${time})...`);
    await page.goto(`${DEFAULT_TALKFIRST_BASE_URL}${WEB_ROUTES.MY_SCHEDULE}`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_SCHEDULE_NAVIGATION_MS,
    });

    await page.waitForSelector(SELECTORS.SCHEDULE_WEEK_BUTTON, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});

    // Switch to target week
    const isThisWeek = targetWeek === WEEK_MODES.THIS || targetWeek === 'current' || options.thisWeek;
    const weekButtonText = isThisWeek ? 'This Week' : 'Next Week';

    const weekBtn = page.locator(`button:has-text("${weekButtonText}")`).first();
    if (await weekBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await weekBtn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});
      await sleep(600);
    }

    // Ensure "All" filter is active
    const allBtn = page.locator(SELECTORS.SCHEDULE_ALL_FILTER_BUTTON).first();
    if (await allBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allBtn.click({ timeout: 3000 }).catch(() => {});
      await sleep(300);
    }

    // 1. Locate slot and cell on the timetable grid
    const outcome = await locateAndRevealPopover(page, course);
    if (!outcome.found) {
      throw new Error(outcome.message || 'Course slot not found on schedule grid.');
    }

    const dayIndex = calculateDayIndex(date);
    const timeSlot = time;
    const rowLocator = page.locator(SELECTORS.SCHEDULE_GRID_ROW).filter({ hasText: timeSlot }).first();
    const cellLocator = dayIndex !== null ? rowLocator.locator(SELECTORS.SCHEDULE_GRID_CELL).nth(dayIndex) : null;

    // 2. Real mouse hover over the registered card to trigger the CANCEL button state
    console.log(`   👉 [Cancel Tab #${tabIndex + 1}] Hovering over enrolled class card...`);

    let targetCard = null;
    if (cellLocator) {
      const registeredCard = cellLocator
        .locator(SELECTORS.SCHEDULE_CURSOR_POINTER)
        .filter({ hasText: /REGISTERED|CANCEL|ĐÃ ĐĂNG KÝ|HỦY/i })
        .first();
      const fallbackCard = cellLocator.locator(SELECTORS.SCHEDULE_CURSOR_POINTER).first();
      targetCard = (await registeredCard.count()) > 0 ? registeredCard : fallbackCard;
    } else {
      targetCard = page.locator(SELECTORS.SCHEDULE_CURSOR_POINTER).filter({ hasText: /REGISTERED|CANCEL/i }).first();
    }

    if (targetCard && (await targetCard.isVisible({ timeout: 3000 }).catch(() => false))) {
      await targetCard.scrollIntoViewIfNeeded().catch(() => {});
      const box = await targetCard.boundingBox();
      if (box) {
        // Move mouse to the center of the card
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
        await sleep(300);
      }
      // Dispatch synthetic events for React state handlers
      await targetCard.evaluate((el: any) => {
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
        const propsKey = Object.keys(el).find((k) => k.startsWith('__reactProps'));
        if (propsKey && el[propsKey]?.onMouseEnter) {
          try {
            el[propsKey].onMouseEnter({
              currentTarget: el,
              target: el,
              preventDefault: () => {},
              stopPropagation: () => {},
            });
          } catch {}
        }
      }).catch(() => {});
      await sleep(400);
    }

    // 3. Click CANCEL on the card or in the popover to open the confirmation modal
    console.log(`   👉 [Cancel Tab #${tabIndex + 1}] Clicking CANCEL to open confirmation modal...`);

    let clicked = false;
    if (cellLocator) {
      const cancelOnCard = cellLocator.locator('div, span, button').filter({ hasText: /^CANCEL$|^HỦY$/i }).first();
      if (await cancelOnCard.isVisible({ timeout: 1500 }).catch(() => false)) {
        await cancelOnCard.click({ force: true }).catch(() => {});
        clicked = true;
      }
    }

    if (!clicked) {
      const cancelBtnInPopover = page
        .locator(SELECTORS.CANCEL_BUTTON)
        .filter({ hasText: /CANCEL|HỦY|CLOSE|ĐÓNG/i })
        .filter({ hasNot: page.locator('button[aria-label="Close"], button:has-text("✕")') })
        .first();

      if (await cancelBtnInPopover.isVisible({ timeout: 1500 }).catch(() => false)) {
        await cancelBtnInPopover.click({ timeout: TIMEOUTS.BUTTON_CLICK_TIMEOUT_MS, force: true }).catch(() => {});
        clicked = true;
      }
    }

    if (!clicked && targetCard) {
      await targetCard.click({ force: true }).catch(() => {});
      clicked = true;
    }

    await sleep(1000);

    // 4. Intercept API responses early (before Turnstile) so we don't miss any API response
    const apiCancelRequests: Array<{ url: string; method: string; status: number; data?: any }> = [];
    const responseHandler = async (res: any) => {
      const url = res.url();
      const method = res.request().method();
      if (
        url.includes('/api/') &&
        (method === 'DELETE' || method === 'POST' || method === 'PUT' || method === 'PATCH')
      ) {
        try {
          const json = await res.json();
          apiCancelRequests.push({ url, method, status: res.status(), data: json });
        } catch {
          apiCancelRequests.push({ url, method, status: res.status() });
        }
      }
    };
    page.on('response', responseHandler);

    // 5. Solve Turnstile in CANCEL REGISTRATION modal
    console.log(`   🛡️ [Cancel Tab #${tabIndex + 1}] Solving Cloudflare Turnstile in cancel modal...`);
    const token = await solveTurnstile(page, TIMEOUTS.TURNSTILE_MODAL_TIMEOUT_MS);
    if (token) {
      console.log(`   ✅ [Cancel Tab #${tabIndex + 1}] Turnstile solved successfully!`);
    } else {
      console.warn(`   ⚠️ [Cancel Tab #${tabIndex + 1}] Turnstile timed out — submitting anyway, server may reject...`);
    }

    // 5. Click "Cancel Class" confirmation button in modal
    console.log(`   🗑️ [Cancel Tab #${tabIndex + 1}] Finding confirmation button in modal...`);
    const modalDialog = page.locator(SELECTORS.MODAL_DIALOG).first();
    await modalDialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    const confirmCancelBtn = page
      .locator(SELECTORS.MODAL_CANCEL_CLASS_BUTTON)
      .filter({ hasNot: page.locator('button[aria-label="Close"], button:has-text("✕")') })
      .first();

    if (await confirmCancelBtn.isVisible({ timeout: TIMEOUTS.BUTTON_CLICK_TIMEOUT_MS }).catch(() => false)) {
      const btnText = (await confirmCancelBtn.innerText().catch(() => 'Cancel Button')).trim();
      console.log(`   🗑️ [Cancel Tab #${tabIndex + 1}] Clicking modal action button: "${btnText}"...`);
      await confirmCancelBtn.click({ timeout: TIMEOUTS.BUTTON_CLICK_TIMEOUT_MS, force: true }).catch((err) => {
        console.warn(
          `   [Cancel Tab #${tabIndex + 1}] Confirm cancel click warning: ${err instanceof Error ? err.message : err}`
        );
      });
    } else {
      // Fallback: click submit button
      const submitBtn = modalDialog.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click({ force: true }).catch(() => {});
      } else {
        page.off('response', responseHandler);
        throw new Error('Action button (Cancel Class / Confirm) did not appear in modal dialog.');
      }
    }

    // Wait for API response or modal close
    await Promise.race([
      modalDialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.MODAL_CLOSE_TIMEOUT_MS }).catch(() => {}),
      sleep(3500),
    ]);
    await sleep(1000);

    page.off('response', responseHandler);

    // 6. Inspect Toast & API outcome
    const successfulCancelApi = apiCancelRequests.find((r) => r.status >= 200 && r.status < 300);
    const errorCancelApi = apiCancelRequests.find((r) => r.status >= 400);

    const toastText = await page.evaluate((selector) => {
      const toast = document.querySelector<HTMLElement>(selector);
      return toast ? toast.innerText : null;
    }, SELECTORS.TOAST_CONTAINER);

    const isToastSuccess =
      toastText &&
      (toastText.toLowerCase().includes('thành công') ||
        toastText.toLowerCase().includes('success') ||
        toastText.toLowerCase().includes('hủy') ||
        toastText.toLowerCase().includes('cancelled'));

    const isToastError =
      toastText &&
      (toastText.toLowerCase().includes('fail') ||
        toastText.toLowerCase().includes('error') ||
        toastText.toLowerCase().includes('thất bại'));

    if (successfulCancelApi || isToastSuccess) {
      const successMsg = toastText || successfulCancelApi?.data?.message || 'Class cancelled successfully via API!';
      console.log(`   🎉 [Cancel Tab #${tabIndex + 1}] Course "${lesson}" cancelled successfully! (${successMsg})`);
      return {
        success: true,
        action: 'CANCEL',
        status: REGISTRATION_STATUS.CANCELLED,
        lesson,
        date,
        time,
        teacher: course.teacherNickName || course.teacherName || 'N/A',
        room: course.room || 'N/A',
        message: successMsg,
        response: successfulCancelApi?.data,
      };
    }

    if (errorCancelApi || isToastError) {
      const errMsg =
        errorCancelApi?.data?.message ||
        errorCancelApi?.data?.error ||
        toastText ||
        `Server rejected cancellation (HTTP ${errorCancelApi?.status}).`;
      throw new Error(`Cancellation rejected by server: ${errMsg}`);
    }

    const modalStillOpen = await modalDialog.isVisible().catch(() => false);
    if (!modalStillOpen) {
      console.log(`   🎉 [Cancel Tab #${tabIndex + 1}] Modal closed cleanly: "${lesson}" cancelled!`);
      return {
        success: true,
        action: 'CANCEL',
        status: REGISTRATION_STATUS.CANCELLED,
        lesson,
        date,
        time,
        teacher: course.teacherNickName || course.teacherName || 'N/A',
        room: course.room || 'N/A',
        message: toastText || 'Class cancelled and modal closed.',
      };
    }

    throw new Error('Cancellation modal remained open after clicking action button.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ [Cancel Tab #${tabIndex + 1} Error] "${lesson}": ${message}`);
    return {
      success: false,
      action: 'CANCEL',
      status: REGISTRATION_STATUS.CANCEL_FAILED,
      lesson,
      date,
      time,
      teacher: course.teacherNickName || course.teacherName || 'N/A',
      room: course.room || 'N/A',
      message,
    };
  } finally {
    await sleep(1000);
    await page.close().catch(() => {});
  }
}

/**
 * Spawns concurrent browser tabs in parallel to cancel multiple enrolled courses.
 */
export async function cancelCoursesInBrowser(
  toCancelCourses: CourseCriteria[] = [],
  options: BrowserRegisterOptions = {}
): Promise<RegistrationResultItem[]> {
  if (!toCancelCourses || toCancelCourses.length === 0) {
    return [];
  }

  console.log(`\n🗑️ [Browser Registrar] Spawning ${toCancelCourses.length} concurrent tab(s) for parallel class cancellation...`);

  const tokens = loadTokens();
  if (!tokens?.accessToken) {
    await performBrowserLogin();
  }

  const browser = await connectToChrome();
  const context = browser.contexts()[0] || (await browser.newContext());
  const targetWeek = (options.week || options.weekType || WEEK_MODES.NEXT).toLowerCase();

  const promises = toCancelCourses.map((course, idx) =>
    runSingleCourseCancellationInTab(context, course, options, targetWeek, idx)
  );

  const settled = await Promise.allSettled(promises);
  return settled.map((result, idx) => {
    if (result.status === 'fulfilled') return result.value;
    const course = toCancelCourses[idx];
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    const lessonInfo = course.lessonInfo as { lesson?: string } | undefined;
    console.warn(`   ❌ [Cancel Tab #${idx + 1} Fatal] Unhandled rejection: ${message}`);
    return {
      success: false,
      action: 'CANCEL',
      status: REGISTRATION_STATUS.CANCEL_FAILED,
      lesson: course.lesson || lessonInfo?.lesson || 'N/A',
      date: course.date || 'N/A',
      time: (course.startTime || course.time || 'N/A').slice(0, 5),
      teacher: course.teacherNickName || course.teacherName || 'N/A',
      room: course.room || 'N/A',
      message,
    } satisfies RegistrationResultItem;
  });
}

/**
 * Helper to cancel a single course in browser.
 */
export async function cancelCourseInBrowser(
  course: CourseCriteria,
  options: BrowserRegisterOptions = {}
): Promise<RegistrationResultItem> {
  const results = await cancelCoursesInBrowser([course], options);
  return (
    results[0] || {
      status: REGISTRATION_STATUS.CANCEL_FAILED,
      lesson: course.lesson || 'N/A',
      date: course.date || 'N/A',
      time: (course.startTime || course.time || 'N/A').slice(0, 5),
      teacher: course.teacherNickName || course.teacherName || 'N/A',
      room: course.room || 'N/A',
      success: false,
      message: 'No result from cancellation.',
    }
  );
}
