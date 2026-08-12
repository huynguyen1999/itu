import {
  BROWSER_BUNDLE_ID, BROWSER_DISPLAY_NAME, UPLOAD_ALARM, UPLOAD_PERIOD_MINUTES,
  createActivityStore, createSession, mergeAdjacentSession, normalizeApiBaseUrl,
  retryDelay, stateForTab
} from "./activity.js";

const DEFAULT_SETTINGS = { websiteTrackingEnabled: false, apiBaseUrl: "http://localhost:3000", dsnKey: "", installationId: "" };
const AGGREGATE_SEPARATOR = "\u0000";

function id() { return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function aggregateKey(row) { return [row.localDate, row.browserBundleId, row.url, row.incognito ? "private" : "normal"].join(AGGREGATE_SEPARATOR); }
function domainOf(url) { try { return new URL(url).hostname; } catch { return null; } }

export function createController(api, dependencies = {}) {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const random = dependencies.random ?? Math.random;
  const store = dependencies.store ?? createActivityStore(api);
  let settings = { ...DEFAULT_SETTINGS };
  let currentState = stateForTab(null);
  let activeSince = now();
  let status = "paused";
  let operation = Promise.resolve();
  let migrationDone = false;
  let aggregateCache = {};

  const run = (work) => (operation = operation.then(work, work));
  const configured = () => Boolean(normalizeApiBaseUrl(settings.apiBaseUrl) && settings.dsnKey);
  const getStatus = () => ({ status: !settings.websiteTrackingEnabled ? "paused" : configured() ? status : "configuration needed", websiteTrackingEnabled: settings.websiteTrackingEnabled, apiBaseUrl: settings.apiBaseUrl, dsnKey: settings.dsnKey });
  const notifyStatus = () => api.runtime.sendMessage({ type: "status", status: getStatus() }).catch(() => {});

  async function migrateLegacyTotals() {
    if (migrationDone) return;
    const markers = await store.all("meta");
    const stored = await api.storage.local.get({ totals: {}, migrationVersion: 0 });
    if (Number(stored.migrationVersion) >= 2) { migrationDone = true; return; }
    if (markers.some((marker) => marker.key === "legacy-aggregate-migrated")) {
      await api.storage.local.set({ migrationVersion: 2 });
      if (api.storage.local.remove) await api.storage.local.remove(["totals"]); else if (api.state) delete api.state.totals;
      migrationDone = true; return;
    }
    for (const [key, total] of Object.entries(stored.totals ?? {})) {
      if (!total?.url || !total.activeSeconds) continue;
      await store.put("legacyAggregates", { key: `legacy-${key}`, localDate: total.localDate, browserBundleId: total.browserBundleId ?? BROWSER_BUNDLE_ID,
        browserDisplayName: total.browserDisplayName ?? BROWSER_DISPLAY_NAME, hostname: total.hostname ?? domainOf(total.url),
        url: total.url, timezone: total.timezone ?? "UTC", incognito: Boolean(total.incognito), activeSeconds: total.activeSeconds });
    }
    await store.put("meta", { key: "legacy-aggregate-migrated", at: now() });
    await api.storage.local.set({ migrationVersion: 2 });
    if (api.storage.local.remove) await api.storage.local.remove(["totals"]);
    else if (api.state) delete api.state.totals;
    migrationDone = true;
    await rebuildProjections();
  }

  async function rebuildProjections() {
    const sessions = [...await store.all("activitySessions"), ...await store.all("legacyAggregates")];
    const aggregates = new Map();
    for (const session of sessions) {
      const key = aggregateKey(session);
      const current = aggregates.get(key) ?? { key, localDate: session.localDate, browserBundleId: session.browserBundleId, browserDisplayName: session.browserDisplayName, hostname: session.hostname, url: session.url, timezone: session.timezone, incognito: session.incognito, activeSeconds: 0 };
      current.activeSeconds += session.activeSeconds;
      aggregates.set(key, current);
    }
    await store.clear("dailyUrlAggregates"); await store.clear("dailyDomainAggregates");
    aggregateCache = {};
    for (const row of aggregates.values()) {
      await store.put("dailyUrlAggregates", row);
      aggregateCache[row.key] = row;
    }
    const domains = new Map();
    for (const row of aggregates.values()) { const key = [row.localDate, row.browserBundleId, row.hostname, row.incognito ? "private" : "normal"].join(AGGREGATE_SEPARATOR); const current = domains.get(key) ?? { key, localDate: row.localDate, browserBundleId: row.browserBundleId, browserDisplayName: row.browserDisplayName, hostname: row.hostname, timezone: row.timezone, incognito: row.incognito, activeSeconds: 0 }; current.activeSeconds += row.activeSeconds; domains.set(key, current); }
    for (const row of domains.values()) await store.put("dailyDomainAggregates", row);
  }

  async function enqueueSession(session) {
    const existing = (await store.all("syncOutbox")).find((item) => item.id === `session:${session.id}`);
    await store.put("syncOutbox", { ...(existing ?? {}), id: `session:${session.id}`, sessionId: session.id, payload: {
      id: session.id, startedAt: new Date(session.startedAt).toISOString(), endedAt: new Date(session.endedAt).toISOString(),
      browserBundleId: session.browserBundleId, browserDisplayName: session.browserDisplayName, hostname: session.hostname,
      url: session.url, iconUrl: session.iconUrl || null, pageTitle: session.title || null,
      isPrivate: Boolean(session.incognito), timezone: session.timezone
    }, state: existing?.state ?? "PENDING", attempts: existing?.attempts ?? 0, nextAttemptAt: existing?.nextAttemptAt ?? 0, updatedAt: now() });
  }

  async function adjustProjection(session, delta) {
    const key = aggregateKey(session);
    const urlRows = await store.all("dailyUrlAggregates");
    const current = urlRows.find((row) => row.key === key);
    const nextSeconds = (current?.activeSeconds ?? 0) + delta * session.activeSeconds;
    if (nextSeconds <= 0) { if (current) await store.delete("dailyUrlAggregates", key); delete aggregateCache[key]; }
    else {
      const row = { key, localDate: session.localDate, browserBundleId: session.browserBundleId, browserDisplayName: session.browserDisplayName, hostname: session.hostname, url: session.url, timezone: session.timezone, incognito: Boolean(session.incognito), activeSeconds: nextSeconds };
      await store.put("dailyUrlAggregates", row); aggregateCache[key] = row;
    }
    const domainKey = [session.localDate, session.browserBundleId, session.hostname, session.incognito ? "private" : "normal"].join(AGGREGATE_SEPARATOR);
    const domainRows = await store.all("dailyDomainAggregates");
    const domain = domainRows.find((row) => row.key === domainKey);
    const nextDomainSeconds = (domain?.activeSeconds ?? 0) + delta * session.activeSeconds;
    if (nextDomainSeconds <= 0) { if (domain) await store.delete("dailyDomainAggregates", domainKey); }
    else await store.put("dailyDomainAggregates", { key: domainKey, localDate: session.localDate, browserBundleId: session.browserBundleId, browserDisplayName: session.browserDisplayName, hostname: session.hostname, timezone: session.timezone, incognito: Boolean(session.incognito), activeSeconds: nextDomainSeconds });
  }

  async function recordSession(state, startedAt, endedAt) {
    const next = createSession(state, startedAt, endedAt, id());
    if (!next) return;
    const sessions = await store.all("activitySessions");
    const previous = sessions.filter((session) => session.id.indexOf("legacy-") !== 0).sort((a, b) => b.endedAt - a.endedAt)[0];
    const merged = mergeAdjacentSession(previous, next);
    if (merged) { await store.put("activitySessions", merged); await enqueueSession(merged); await adjustProjection(previous, -1); await adjustProjection(merged, 1); }
    else { await store.put("activitySessions", next); await enqueueSession(next); await adjustProjection(next, 1); }
  }

  async function activeTabState() {
    try {
      const focused = await api.windows.getLastFocused({ populate: true });
      if (focused?.focused === false) return stateForTab(null);
      return stateForTab(focused?.tabs?.find((tab) => tab.active));
    } catch { return stateForTab(null); }
  }

  async function settle(at = now()) {
    await recordSession(currentState, activeSince, at);
    activeSince = at;
  }

  async function upload(force = false) {
    if (!settings.websiteTrackingEnabled || !configured()) { status = "paused"; notifyStatus(); return; }
    const pending = (await store.all("syncOutbox"))
      .filter((item) => (item.state === "PENDING" || item.state === "RETRY") && (force || item.nextAttemptAt <= now()))
      .sort((a, b) => a.updatedAt - b.updatedAt).slice(0, 100);
    if (!pending.length) { status = "up-to-date"; notifyStatus(); return; }
    try {
      const response = await fetchRequest(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/usage/websites/sessions/ingest`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `DSN ${settings.dsnKey}` },
        body: JSON.stringify({ installationId: settings.installationId, sessions: pending.map((item) => item.payload) })
      });
      if (!response.ok) {
        const blocked = [400, 401, 403, 404, 422].includes(response.status);
        for (const item of pending) await store.put("syncOutbox", { ...item, state: blocked ? "BLOCKED" : item.attempts >= 3 ? "FAILED" : "RETRY", retryable: !blocked, attempts: item.attempts + 1, nextAttemptAt: blocked || item.attempts >= 3 ? 0 : now() + retryDelay(item.attempts + 1, random), updatedAt: now(), error: `HTTP ${response.status}` });
        status = blocked ? "configuration needed" : "disconnected";
        notifyStatus(); return;
      }
      const result = await response.json().catch(() => ({}));
      const acknowledged = result.acknowledgedIds ?? result.acceptedIds ?? result.accepted;
      const rejected = Array.isArray(result.rejected) ? new Map(result.rejected.map((entry) => [entry.id, entry.reason ?? "rejected"])) : new Map();
      for (const item of pending) {
        if (Array.isArray(acknowledged) && (acknowledged.includes(item.id) || acknowledged.includes(item.sessionId))) await store.delete("syncOutbox", item.id);
        else if (rejected.has(item.sessionId)) await store.put("syncOutbox", { ...item, state: "FAILED", retryable: false, nextAttemptAt: 0, updatedAt: now(), error: rejected.get(item.sessionId) });
        else if (!Array.isArray(acknowledged) && !rejected.size) await store.delete("syncOutbox", item.id);
      }
      status = "connected";
    } catch {
      for (const item of pending) await store.put("syncOutbox", { ...item, state: item.attempts >= 3 ? "FAILED" : "RETRY", retryable: true, attempts: item.attempts + 1, nextAttemptAt: item.attempts >= 3 ? 0 : now() + retryDelay(item.attempts + 1, random), updatedAt: now(), error: "offline" });
      status = "disconnected";
    }
    notifyStatus();
  }

  async function clearLocalRange(from, to, all = false) {
    const rows = await store.all("activitySessions");
    const removed = rows.filter((row) => all || (row.localDate >= from && row.localDate <= to));
    for (const row of removed) { await store.delete("activitySessions", row.id); await store.delete("syncOutbox", `session:${row.id}`); }
    for (const row of await store.all("legacyAggregates")) if (all || (row.localDate >= from && row.localDate <= to)) await store.delete("legacyAggregates", row.key);
    await rebuildProjections();
    await store.put("meta", { key: "tracking-state", value: { state: currentState, activeSince } });
    return true;
  }

  async function retryFailed() {
    for (const item of await store.all("syncOutbox")) if (item.state === "FAILED") await store.put("syncOutbox", { ...item, state: "RETRY", attempts: 0, nextAttemptAt: 0, updatedAt: now() });
    await upload(true);
  }

  async function recoverFailedOnSignal() {
    if (globalThis.navigator?.onLine === false) return false;
    let changed = false;
    for (const item of await store.all("syncOutbox")) if (item.state === "FAILED" && item.retryable !== false) { await store.put("syncOutbox", { ...item, state: "RETRY", attempts: 0, nextAttemptAt: 0, updatedAt: now() }); changed = true; }
    if (changed) await upload(true);
    return changed;
  }

  async function resetUsage() {
    await clearLocalRange("", "", true);
    await store.clear("syncOutbox"); await store.clear("dailyUrlAggregates"); await store.clear("dailyDomainAggregates"); await store.clear("legacyAggregates"); await store.clear("meta");
    settings = { ...DEFAULT_SETTINGS, installationId: id() };
    if (api.storage.local.remove) await api.storage.local.remove(["totals", "trackingState", "websiteTrackingEnabled", "apiBaseUrl", "dsnKey", "installationId"]);
    await api.storage.local.set({ ...settings, totals: {}, trackingState: null });
    currentState = stateForTab(null); activeSince = now(); status = "paused";
    return true;
  }

  async function reconcile(shouldUpload = true) {
    const at = now();
    await settle(at);
    currentState = settings.websiteTrackingEnabled ? await activeTabState() : stateForTab(null);
    activeSince = at;
    await store.put("meta", { key: "tracking-state", value: { state: currentState, activeSince } });
    if (shouldUpload) await upload();
  }

  async function saveSettings(next) {
    await settle();
    settings = { ...settings, websiteTrackingEnabled: next.websiteTrackingEnabled === true, apiBaseUrl: normalizeApiBaseUrl(next.apiBaseUrl), dsnKey: String(next.dsnKey ?? "").trim() };
    await api.storage.local.set(settings);
    currentState = settings.websiteTrackingEnabled ? await activeTabState() : stateForTab(null);
    activeSince = now();
    const recovered = await recoverFailedOnSignal();
    if (!recovered) await upload(true);
    return getStatus();
  }

  async function initialize() {
    const stored = await api.storage.local.get(DEFAULT_SETTINGS);
    settings = { ...DEFAULT_SETTINGS, ...stored };
    if (!settings.installationId) { settings.installationId = id(); await api.storage.local.set({ installationId: settings.installationId }); }
    await migrateLegacyTotals();
    const marker = (await store.all("meta")).find((item) => item.key === "tracking-state");
    if (marker?.value) { currentState = marker.value.state; activeSince = marker.value.activeSince || now(); }
    await api.alarms.create(UPLOAD_ALARM, { periodInMinutes: UPLOAD_PERIOD_MINUTES });
    await reconcile();
  }

  api.tabs.onActivated.addListener(() => run(() => reconcile(false)));
  api.tabs.onUpdated.addListener(() => run(() => reconcile(false)));
  api.windows.onFocusChanged.addListener(() => run(() => reconcile(false)));
  globalThis.addEventListener?.("online", () => run(recoverFailedOnSignal));
  api.alarms.onAlarm.addListener((alarm) => { if (alarm.name === UPLOAD_ALARM) run(reconcile); });
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "getStatus") { sendResponse(getStatus()); return false; }
    if (message?.type === "getUsage") { ready.then(async () => { await recoverFailedOnSignal(); sendResponse(Object.values(aggregateCache)); }).catch(() => sendResponse([])); return true; }
    if (message?.type === "getSessions") { ready.then(async () => sendResponse(await store.all("activitySessions"))).catch(() => sendResponse([])); return true; }
    if (message?.type === "getOutbox") { ready.then(async () => sendResponse(await store.all("syncOutbox"))).catch(() => sendResponse([])); return true; }
    if (message?.type === "retrySync") { run(retryFailed).then(sendResponse); return true; }
    if (message?.type === "online") { run(recoverFailedOnSignal).then(sendResponse); return true; }
    if (message?.type === "clearUsage") { run(() => clearLocalRange(message.from, message.to, message.all === true)).then(sendResponse); return true; }
    if (message?.type === "resetUsage") { run(resetUsage).then(sendResponse); return true; }
    if (message?.type === "saveSettings") { run(() => saveSettings(message.settings)).then(sendResponse); return true; }
    return false;
  });

  const ready = run(initialize);
  return { ready, getStatus, reconcile: () => run(reconcile), upload: () => run(upload), saveSettings: (next) => run(() => saveSettings(next)), getTotals: () => aggregateCache };
}

if (typeof chrome !== "undefined") createController(chrome);
