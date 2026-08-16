/**
 * bypass.ts
 *
 * Automated Cloudflare Turnstile bypass and student login helper via Chrome DevTools Protocol.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright';
import {
  API_ROUTES,
  DEFAULT_CDP_ENDPOINT,
  DEFAULT_CHROME_EXECUTABLE_PATH,
  DEFAULT_TALKFIRST_BASE_URL,
  DEFAULT_USER_DATA_DIR,
  SELECTORS,
  TIMEOUTS,
  WEB_ROUTES,
} from './constants.ts';
import { saveTokens } from './token-manager.ts';
import type { AuthTokens, BrowserLoginOptions } from './types.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const TARGET_URL = process.env.TARGET_URL ?? `${DEFAULT_TALKFIRST_BASE_URL}${WEB_ROUTES.HOME}`;
const CDP_ENDPOINT = process.env.CDP_ENDPOINT ?? DEFAULT_CDP_ENDPOINT;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Loads .env file into process.env if not already set.
 */
export function loadEnv(): void {
  const envPath = resolve(currentDir, '../.env');
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;

    const key = match[1];
    let val = (match[2] || '').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

/**
 * Checks whether Chrome CDP endpoint is actively responding.
 */
async function isChromeCdpAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${CDP_ENDPOINT}/json/version`, {
      signal: AbortSignal.timeout(TIMEOUTS.CDP_PROBE_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensures Google Chrome is running with remote debugging enabled.
 */
export async function ensureChromeRunning(): Promise<void> {
  if (await isChromeCdpAvailable()) {
    return;
  }

  console.log('   [bypass] Starting Google Chrome with CDP on port 9223...');
  const chromePath = DEFAULT_CHROME_EXECUTABLE_PATH;
  const proc = spawn(
    chromePath,
    [
      '--remote-debugging-port=9223',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${DEFAULT_USER_DATA_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' }
  );
  proc.unref();

  for (let attempt = 0; attempt < TIMEOUTS.MAX_CHROME_LAUNCH_ATTEMPTS; attempt++) {
    await sleep(TIMEOUTS.CHROME_LAUNCH_STEP_MS);
    if (await isChromeCdpAvailable()) {
      console.log('   [bypass] Chrome is ready ✅');
      return;
    }
  }

  throw new Error('Could not launch Chrome on port 9223.');
}

/**
 * Connects Playwright to the running Chrome instance over CDP.
 */
export async function connectToChrome(): Promise<Browser> {
  await ensureChromeRunning();

  // Ensure at least one active page context exists in Chrome so Playwright's CDP handshake succeeds
  try {
    const listRes = await fetch(`${CDP_ENDPOINT}/json/list`, {
      signal: AbortSignal.timeout(TIMEOUTS.CDP_PROBE_MS),
    });
    if (listRes.ok) {
      const list = (await listRes.json()) as Array<{ type?: string }>;
      const pages = list.filter((target) => target.type === 'page');
      if (pages.length === 0) {
        await fetch(`${CDP_ENDPOINT}/json/new`, {
          method: 'PUT',
          signal: AbortSignal.timeout(TIMEOUTS.CDP_PROBE_MS),
        }).catch(() => {});
      }
    }
  } catch {}

  return await chromium.connectOverCDP(CDP_ENDPOINT);
}

/**
 * Extracts student session cookies from the browser context.
 */
export async function extractAndSaveCookies(context: BrowserContext): Promise<AuthTokens | null> {
  try {
    const cookies = await context.cookies([DEFAULT_TALKFIRST_BASE_URL, `${DEFAULT_TALKFIRST_BASE_URL}/`]);
    const accessToken = cookies.find((c) => c.name === 'accessToken')?.value;
    const refreshToken = cookies.find((c) => c.name === 'refreshToken')?.value;

    if (accessToken || refreshToken) {
      const saved = saveTokens({ accessToken, refreshToken });
      console.log('   [bypass] 🔑 Successfully extracted and saved tokens:');
      console.log('            User:', saved.user?.email || 'N/A');
      console.log('            Access Token Expires:', saved.accessTokenExpiresAt || 'N/A');
      return saved;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('   [bypass] Warning: Could not extract cookies:', message);
  }
  return null;
}

/**
 * Waits for Turnstile to solve and yield a token or solve marker.
 */
async function waitForTurnstileToken(page: Page, cfFrame: Frame | null): Promise<string | null> {
  const deadline = Date.now() + TIMEOUTS.TURNSTILE_LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const token = await page.evaluate((selector) => {
      const el = document.querySelector<HTMLInputElement>(selector);
      return el?.value ?? null;
    }, SELECTORS.TURNSTILE_RESPONSE_INPUT);

    if (token && token.length > 10) {
      return token;
    }

    const frameGone = !page.frames().some((f) => f.url().includes(SELECTORS.TURNSTILE_FRAME_HOST));
    if (frameGone) {
      return 'SOLVED';
    }

    if (cfFrame) {
      try {
        const iframeDone = await cfFrame.evaluate((selector) => {
          return document.querySelector(selector) !== null;
        }, SELECTORS.TURNSTILE_SOLVED_MARKER);
        if (iframeDone) return 'SOLVED_VIA_IFRAME';
      } catch {}
    }

    await sleep(TIMEOUTS.TURNSTILE_POLL_INTERVAL_MS);
  }
  return null;
}

/**
 * Attempts to click Turnstile challenge checkbox if present on page.
 */
async function clickTurnstileIfPresent(page: Page): Promise<boolean> {
  let turnstileFrame: Frame | null = null;
  for (let i = 0; i < TIMEOUTS.TURNSTILE_DETECTION_ATTEMPTS; i++) {
    for (const frame of page.frames()) {
      if (frame.url().includes(SELECTORS.TURNSTILE_FRAME_HOST)) {
        turnstileFrame = frame;
        break;
      }
    }
    if (turnstileFrame) break;
    await sleep(500);
  }

  if (!turnstileFrame) {
    console.log('   [bypass] No Turnstile challenge detected.');
    return false;
  }

  console.log('   [bypass] Turnstile challenge found. Clicking checkbox...');
  try {
    const checkbox = turnstileFrame.locator(SELECTORS.TURNSTILE_CHECKBOX);
    await checkbox.waitFor({ timeout: 6000 });
    const box = await checkbox.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx + randomRange(20, 60), cy + randomRange(10, 30), { steps: 8 });
      await sleep(randomRange(80, 150));
      await page.mouse.click(cx, cy);
    }
  } catch {
    await turnstileFrame
      .evaluate(() => {
        const el =
          document.querySelector('label') ?? document.querySelector<HTMLInputElement>('input[type="checkbox"]');
        el?.click();
      })
      .catch(() => {});
  }

  const token = await waitForTurnstileToken(page, turnstileFrame);
  if (token) {
    console.log('   [bypass] ✅ Cloudflare Turnstile solved successfully!');
    return true;
  }

  return false;
}

/**
 * Automates login credentials input and form submission.
 */
async function fillAndSubmitLoginForm(page: Page, options: BrowserLoginOptions): Promise<void> {
  const username = process.env.EMAIL;
  const password = process.env.PASSWORD;

  if (!username || !password) {
    return;
  }

  if (options.noSubmit || options.fillOnly) {
    console.log('   [bypass] Filling login credentials (no-submit mode)...');
  } else {
    console.log('   [bypass] Submitting login credentials...');
  }

  await sleep(800);
  try {
    const userInput = page.locator(SELECTORS.LOGIN_USERNAME_INPUT).first();
    const passInput = page.locator(SELECTORS.LOGIN_PASSWORD_INPUT).first();

    if (!(await userInput.isVisible({ timeout: 4000 }).catch(() => false))) {
      return;
    }

    await userInput.fill(username);
    await sleep(randomRange(200, 400));
    await passInput.fill(password);
    await sleep(randomRange(300, 600));

    if (options.noSubmit || options.fillOnly) {
      return;
    }

    const submitBtn = page.locator(SELECTORS.LOGIN_SUBMIT_BUTTON).first();
    if (await submitBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await submitBtn.click({ timeout: 5000, force: true }).catch((err) => {
        console.warn('   [bypass] Submit button click error:', err instanceof Error ? err.message : err);
      });
      await Promise.race([
        page.waitForURL((url) => !url.pathname.includes(WEB_ROUTES.AUTH_LOGIN), {
          timeout: TIMEOUTS.AUTH_TRANSITION_TIMEOUT_MS,
        }),
        page.waitForLoadState('networkidle', { timeout: TIMEOUTS.NETWORK_IDLE_TIMEOUT_MS }),
      ]).catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('   [bypass] Form fill warning:', message);
  }
}

/**
 * Automates the complete browser login and Turnstile solve flow.
 */
export async function performBrowserLogin(
  options: BrowserLoginOptions = {}
): Promise<AuthTokens | { success: boolean; filled: boolean }> {
  loadEnv();
  console.log('🌐 [Bypass] Initializing Automated Chrome Login & Turnstile Solver...');

  const browser = await connectToChrome();
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();

  let capturedData: AuthTokens | null = null;

  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (url.includes(API_ROUTES.AUTH_LOGIN) || url.includes(API_ROUTES.AUTH_REFRESH)) {
        if (response.ok()) {
          const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
          if (data.accessToken || data.refreshToken) {
            capturedData = saveTokens(data);
            console.log('   [bypass] 🔑 Captured auth tokens from network response ✅');
          }
        }
      }
    } catch {}
  });

  console.log(`   [bypass] Opening ${TARGET_URL}...`);
  await page.goto(TARGET_URL, { waitUntil: 'load', timeout: TIMEOUTS.PAGE_NAVIGATION_MS });

  console.log('   [bypass] Checking for Cloudflare Turnstile...');
  await clickTurnstileIfPresent(page);

  await fillAndSubmitLoginForm(page, options);

  if (options.noSubmit || options.fillOnly) {
    console.log('   [bypass] ✅ Form filled. Browser tab left open on login page.');
    return { success: true, filled: true };
  }

  await sleep(1500);
  const cookieTokens = await extractAndSaveCookies(context);
  const finalTokens = capturedData || cookieTokens;

  await page.close().catch(() => {});

  if (!finalTokens || (!finalTokens.accessToken && !finalTokens.refreshToken)) {
    throw new Error('Browser login did not capture valid tokens. Please verify credentials in .env.');
  }

  return finalTokens;
}

/**
 * Checks if Chrome already has an active authenticated session using 1 tab.
 * If not logged in, performs the complete login flow in that 1 tab.
 */
export async function ensureBrowserSessionActive(): Promise<
  AuthTokens | { success: boolean; alreadyLoggedIn?: boolean; filled?: boolean }
> {
  console.log('🔑 [Bypass] Checking Chrome login state (using 1 tab)...');
  const browser = await connectToChrome();
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();

  try {
    await page.goto(`${DEFAULT_TALKFIRST_BASE_URL}${WEB_ROUTES.MY_SCHEDULE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await sleep(1000);

    const isLogin =
      page.url().includes(WEB_ROUTES.AUTH_LOGIN) ||
      (await page.locator(SELECTORS.LOGIN_SUBMIT_BUTTON).first().isVisible({ timeout: 2000 }).catch(() => false));

    if (!isLogin) {
      console.log('   ✅ Chrome is already logged into TalkFirst.');
      await extractAndSaveCookies(context);
      return { success: true, alreadyLoggedIn: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('   [Bypass] Session check navigation warning:', message);
  } finally {
    await page.close().catch(() => {});
  }

  console.log('   🌐 Opening 1 tab to log into TalkFirst in Chrome...');
  return await performBrowserLogin();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  performBrowserLogin().catch((err) => {
    console.error('❌ Login failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
