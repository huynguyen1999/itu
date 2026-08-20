import {
  MAX_ELAPSED_SECONDS, UPLOAD_ALARM, UPLOAD_PERIOD_MINUTES, browserIdentity, createActivityStore,
  createSession, mergeAdjacentSession, normalizeApiBaseUrl, retryDelay,
  stateForTab
} from "./activity.js";

export const DEFAULT_SETTINGS = {
  trackingEnabled: true,
  websiteTrackingEnabled: false,
  apiBaseUrl: "http://localhost:3000",
  dsnKey: "",
  installationId: "",
  uploadEnabled: true,
  privateTrackingEnabled: true,
  accountId: "default"
};

const RETENTION_DAYS = 90;
const ACCOUNT_ID = "default";

const AGGREGATE_SEPARATOR = "\u0000";

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function aggregateKey(row) {
  return [accountOf(row), row.localDate, row.browserBundleId, row.url, row.incognito ? "private" : "normal"].join(AGGREGATE_SEPARATOR);
}

function domainOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function accountOf(value) {
  return typeof value?.accountId === "string" && value.accountId.trim() ? value.accountId.trim() : ACCOUNT_ID;
}

function normalizeSettings(value = {}, defaults = {}) {
  const raw = { ...DEFAULT_SETTINGS, ...defaults, ...value };
  const websiteTrackingEnabled = raw.websiteTrackingEnabled ?? raw.trackingEnabled ?? false;
  return {
    ...raw,
    trackingEnabled: raw.trackingEnabled !== false,
    websiteTrackingEnabled: websiteTrackingEnabled === true,
    apiBaseUrl: normalizeApiBaseUrl(raw.apiBaseUrl),
    dsnKey: String(raw.dsnKey ?? "").trim(),
    uploadEnabled: raw.uploadEnabled !== false,
    privateTrackingEnabled: raw.privateTrackingEnabled === true,
    accountId: accountOf(raw)
  };
}

export function createController(adapter, dependencies = {}) {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const random = dependencies.random ?? Math.random;
  const store = dependencies.store ?? createActivityStore();
  const local = adapter.localStore;
  const injectedIdentity = dependencies.browserIdentity ?? dependencies.identity ??
    (dependencies.bundleId || dependencies.displayName ? dependencies : adapter.identity);
  const identity = browserIdentity(injectedIdentity);
  const settingsDefaults = adapter.settingsDefaults ?? {};
  let settings = normalizeSettings({}, settingsDefaults);
  let currentState = stateForTab(null);
  let activeSince = now();
  let status = "paused";
  let operation = Promise.resolve();
  let migrationDone = false;
  let aggregateCache = {};

  const run = (work) => (operation = operation.then(work, work));
  const trackingActive = () => settings.trackingEnabled && settings.websiteTrackingEnabled;
  const configured = () => Boolean(normalizeApiBaseUrl(settings.apiBaseUrl) && settings.dsnKey);
  const getStatus = () => ({
    status: !trackingActive() || !settings.uploadEnabled ? "paused" : configured() ? status : "configuration needed",
    trackingEnabled: settings.trackingEnabled,
    websiteTrackingEnabled: settings.websiteTrackingEnabled,
    apiBaseUrl: settings.apiBaseUrl,
    dsnKey: settings.dsnKey,
    uploadEnabled: settings.uploadEnabled,
    privateTrackingEnabled: settings.privateTrackingEnabled,
    accountId: settings.accountId
  });
  const notifyStatus = () => Promise.resolve(adapter.notifyStatus?.(getStatus())).catch(() => {});
  const visible = (row) => accountOf(row) === settings.accountId;

  async function migrateLegacyTotals() {
    if (migrationDone) return;
    const markers = await store.all("meta");
    const stored = await local.get({ totals: {}, migrationVersion: 0 });
    if (Number(stored.migrationVersion) >= 2) { migrationDone = true; return; }
    if (markers.some((marker) => marker.key === "legacy-aggregate-migrated")) {
      await local.set({ migrationVersion: 2 });
      await local.remove?.(["totals"]);
      migrationDone = true;
      return;
    }
    for (const [key, total] of Object.entries(stored.totals ?? {})) {
      if (!total?.url || !total.activeSeconds) continue;
      await store.put("legacyAggregates", {
        key: `legacy-${key}`,
        accountId: accountOf(total),
        localDate: total.localDate,
        browserBundleId: total.browserBundleId ?? identity.bundleId,
        browserDisplayName: total.browserDisplayName ?? identity.displayName,
        hostname: total.hostname ?? domainOf(total.url),
        url: total.url,
        timezone: total.timezone ?? "UTC",
        incognito: Boolean(total.incognito),
        activeSeconds: total.activeSeconds
      });
    }
    await store.put("meta", { key: "legacy-aggregate-migrated", at: now() });
    await local.set({ migrationVersion: 2 });
    await local.remove?.(["totals"]);
    migrationDone = true;
    await rebuildProjections();
  }

  async function rebuildProjections() {
    const sessions = [...await store.all("activitySessions"), ...await store.all("legacyAggregates")];
    const aggregates = new Map();
    for (const session of sessions) {
      const key = aggregateKey(session);
      const current = aggregates.get(key) ?? {
        key,
        accountId: accountOf(session),
        localDate: session.localDate,
        browserBundleId: session.browserBundleId,
        browserDisplayName: session.browserDisplayName,
        hostname: session.hostname,
        url: session.url,
        timezone: session.timezone,
        incognito: session.incognito,
        activeSeconds: 0
      };
      current.activeSeconds += session.activeSeconds;
      aggregates.set(key, current);
    }
    await store.clear("dailyUrlAggregates");
    await store.clear("dailyDomainAggregates");
    aggregateCache = {};
    for (const row of aggregates.values()) {
      await store.put("dailyUrlAggregates", row);
      aggregateCache[row.key] = row;
    }
    const domains = new Map();
    for (const row of aggregates.values()) {
      const key = [accountOf(row), row.localDate, row.browserBundleId, row.hostname, row.incognito ? "private" : "normal"].join(AGGREGATE_SEPARATOR);
      const current = domains.get(key) ?? {
        key,
        accountId: accountOf(row),
        localDate: row.localDate,
        browserBundleId: row.browserBundleId,
        browserDisplayName: row.browserDisplayName,
        hostname: row.hostname,
        timezone: row.timezone,
        incognito: row.incognito,
        activeSeconds: 0
      };
      current.activeSeconds += row.activeSeconds;
      domains.set(key, current);
    }
    for (const row of domains.values()) await store.put("dailyDomainAggregates", row);
  }

  async function enqueueSession(session) {
    const existing = (await store.all("syncOutbox")).find((item) => item.id === `session:${session.id}`);
    await store.put("syncOutbox", {
      ...(existing ?? {}),
      id: `session:${session.id}`,
      sessionId: session.id,
      accountId: accountOf(session),
      payload: {
        id: session.id,
        startedAt: new Date(session.startedAt).toISOString(),
        endedAt: new Date(session.endedAt).toISOString(),
        browserBundleId: session.browserBundleId,
        browserDisplayName: session.browserDisplayName,
        hostname: session.hostname,
        url: session.url,
        iconUrl: session.iconUrl || null,
        pageTitle: session.title || null,
        isPrivate: Boolean(session.incognito),
        timezone: session.timezone
      },
      state: existing?.state ?? "PENDING",
      attempts: existing?.attempts ?? 0,
      nextAttemptAt: existing?.nextAttemptAt ?? 0,
      updatedAt: now()
    });
  }

  async function adjustProjection(session, delta) {
    const key = aggregateKey(session);
    const current = (await store.all("dailyUrlAggregates")).find((row) => row.key === key);
    const nextSeconds = (current?.activeSeconds ?? 0) + delta * session.activeSeconds;
    if (nextSeconds <= 0) {
      if (current) await store.delete("dailyUrlAggregates", key);
      delete aggregateCache[key];
    } else {
      const row = {
        key,
        accountId: accountOf(session),
        localDate: session.localDate,
        browserBundleId: session.browserBundleId,
        browserDisplayName: session.browserDisplayName,
        hostname: session.hostname,
        url: session.url,
        timezone: session.timezone,
        incognito: Boolean(session.incognito),
        activeSeconds: nextSeconds
      };
      await store.put("dailyUrlAggregates", row);
      aggregateCache[key] = row;
    }
    const domainKey = [accountOf(session), session.localDate, session.browserBundleId, session.hostname, session.incognito ? "private" : "normal"].join(AGGREGATE_SEPARATOR);
    const domain = (await store.all("dailyDomainAggregates")).find((row) => row.key === domainKey);
    const nextDomainSeconds = (domain?.activeSeconds ?? 0) + delta * session.activeSeconds;
    if (nextDomainSeconds <= 0) {
      if (domain) await store.delete("dailyDomainAggregates", domainKey);
    } else {
      await store.put("dailyDomainAggregates", {
        key: domainKey,
        accountId: accountOf(session),
        localDate: session.localDate,
        browserBundleId: session.browserBundleId,
        browserDisplayName: session.browserDisplayName,
        hostname: session.hostname,
        timezone: session.timezone,
        incognito: Boolean(session.incognito),
        activeSeconds: nextDomainSeconds
      });
    }
  }

  async function recordSession(state, startedAt, endedAt) {
    if (state?.incognito && !settings.privateTrackingEnabled) return;
    const next = createSession(state, startedAt, endedAt, id(), identity);
    if (!next) return;
    next.accountId = settings.accountId;
    const sessions = await store.all("activitySessions");
    const previous = sessions
      .filter((session) => !String(session.id).startsWith("legacy-") && accountOf(session) === accountOf(next))
      .sort((left, right) => right.endedAt - left.endedAt)[0];
    const merged = mergeAdjacentSession(previous, next);
    if (merged) {
      await store.put("activitySessions", merged);
      await enqueueSession(merged);
      await adjustProjection(previous, -1);
      await adjustProjection(merged, 1);
    } else {
      await store.put("activitySessions", next);
      await enqueueSession(next);
      await adjustProjection(next, 1);
    }
  }

  async function settle(at = now()) {
    await recordSession(currentState, activeSince, at);
    activeSince = at;
  }

  async function cleanupExpiredSessions() {
    const cutoff = now() - RETENTION_DAYS * 86_400_000;
    const outboxSessionIds = new Set((await store.all("syncOutbox")).map((item) => item.sessionId));
    let removed = false;
    for (const session of await store.all("activitySessions")) {
      const endedAt = typeof session.endedAt === "number" ? session.endedAt : Date.parse(session.endedAt);
      if (Number.isFinite(endedAt) && endedAt < cutoff && !outboxSessionIds.has(session.id)) {
        await store.delete("activitySessions", session.id);
        removed = true;
      }
    }
    if (removed) await rebuildProjections();
    return removed;
  }

  async function upload(force = false) {
    if (!trackingActive() || !settings.uploadEnabled || !configured()) {
      status = "paused";
      notifyStatus();
      return;
    }
    const pending = (await store.all("syncOutbox"))
      .filter((item) => accountOf(item) === settings.accountId && (item.state === "PENDING" || item.state === "RETRY") && (force || item.nextAttemptAt <= now()))
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(0, 100);
    if (!pending.length) {
      status = "up-to-date";
      notifyStatus();
      return;
    }
    try {
      const response = await fetchRequest(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/usage/websites/sessions/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `DSN ${settings.dsnKey}` },
        body: JSON.stringify({ installationId: settings.installationId, sessions: pending.map((item) => item.payload) })
      });
      if (!response.ok) {
        const blocked = [400, 401, 403, 404, 422].includes(response.status);
        for (const item of pending) {
          const exhausted = item.attempts >= 3;
          await store.put("syncOutbox", {
            ...item,
            state: blocked ? "BLOCKED" : exhausted ? "FAILED" : "RETRY",
            retryable: !blocked,
            attempts: item.attempts + 1,
            nextAttemptAt: blocked || exhausted ? 0 : now() + retryDelay(item.attempts + 1, random),
            updatedAt: now(),
            error: `HTTP ${response.status}`
          });
        }
        status = blocked ? "configuration needed" : "disconnected";
        notifyStatus();
        return;
      }
      const result = await response.json().catch(() => ({}));
      const acknowledged = result.acknowledgedIds ?? result.acceptedIds ?? result.accepted;
      const rejected = Array.isArray(result.rejected)
        ? new Map(result.rejected.map((entry) => [entry.id, entry.reason ?? "rejected"]))
        : new Map();
      for (const item of pending) {
        if (Array.isArray(acknowledged) && (acknowledged.includes(item.id) || acknowledged.includes(item.sessionId))) {
          await store.delete("syncOutbox", item.id);
        } else if (rejected.has(item.sessionId)) {
          await store.put("syncOutbox", { ...item, state: "FAILED", retryable: false, nextAttemptAt: 0, updatedAt: now(), error: rejected.get(item.sessionId) });
        } else if (!Array.isArray(acknowledged) && !rejected.size) {
          await store.delete("syncOutbox", item.id);
        }
      }
      await cleanupExpiredSessions();
      status = "connected";
    } catch {
      for (const item of pending) {
        const exhausted = item.attempts >= 3;
        await store.put("syncOutbox", {
          ...item,
          state: exhausted ? "FAILED" : "RETRY",
          retryable: true,
          attempts: item.attempts + 1,
          nextAttemptAt: exhausted ? 0 : now() + retryDelay(item.attempts + 1, random),
          updatedAt: now(),
          error: "offline"
        });
      }
      status = "disconnected";
    }
    notifyStatus();
  }

  async function clearLocalRange(from, to, all = false) {
    const rows = await store.all("activitySessions");
    const removed = rows.filter((row) => all || (row.localDate >= from && row.localDate <= to));
    for (const row of removed) {
      await store.delete("activitySessions", row.id);
      await store.delete("syncOutbox", `session:${row.id}`);
    }
    for (const row of await store.all("legacyAggregates")) {
      if (all || (row.localDate >= from && row.localDate <= to)) await store.delete("legacyAggregates", row.key);
    }
    await rebuildProjections();
    await store.put("meta", { key: "tracking-state", value: { accountId: settings.accountId, state: currentState, activeSince } });
    return true;
  }

  async function retryFailed() {
    for (const item of await store.all("syncOutbox")) {
      if (accountOf(item) === settings.accountId && item.state === "FAILED") {
        await store.put("syncOutbox", { ...item, state: "RETRY", attempts: 0, nextAttemptAt: 0, updatedAt: now() });
      }
    }
    await upload(true);
  }

  async function recoverFailedOnSignal() {
    if (adapter.isOnline?.() === false || !trackingActive() || !settings.uploadEnabled) return false;
    let changed = false;
    for (const item of await store.all("syncOutbox")) {
      if (accountOf(item) === settings.accountId && item.state === "FAILED" && item.retryable !== false) {
        await store.put("syncOutbox", { ...item, state: "RETRY", attempts: 0, nextAttemptAt: 0, updatedAt: now() });
        changed = true;
      }
    }
    if (changed) await upload(true);
    return changed;
  }

  async function resetUsage() {
    await clearLocalRange("", "", true);
    await store.clear("syncOutbox");
    await store.clear("dailyUrlAggregates");
    await store.clear("dailyDomainAggregates");
    await store.clear("legacyAggregates");
    await store.clear("meta");
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...settingsDefaults, installationId: id() });
    await local.remove?.(["totals", "trackingState", "websiteTrackingEnabled", "apiBaseUrl", "dsnKey", "installationId"]);
    await local.set({ ...settings, totals: {}, trackingState: null });
    currentState = stateForTab(null);
    activeSince = now();
    status = "paused";
    return true;
  }

  async function reconcile(shouldUpload = true) {
    const at = now();
    await settle(at);
    currentState = trackingActive() ? await adapter.getActiveState?.() ?? stateForTab(null) : stateForTab(null);
    activeSince = at;
    await store.put("meta", { key: "tracking-state", value: { accountId: settings.accountId, state: currentState, activeSince } });
    if (shouldUpload) await upload();
  }

  async function saveSettings(next = {}) {
    await settle();
    const changes = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
    settings = normalizeSettings({ ...settings, ...settingsDefaults, ...changes });
    await local.set(settings);
    currentState = trackingActive() ? await adapter.getActiveState?.() ?? stateForTab(null) : stateForTab(null);
    activeSince = now();
    const recovered = await recoverFailedOnSignal();
    if (!recovered && trackingActive() && settings.uploadEnabled) await upload(true);
    return getStatus();
  }

  async function initialize() {
    const stored = await local.get(DEFAULT_SETTINGS);
    const nativeSettings = await adapter.loadSettings?.();
    settings = normalizeSettings({
      ...stored,
      ...settingsDefaults,
      ...(nativeSettings?.settings ?? nativeSettings ?? {})
    });
    if (!settings.installationId) {
      settings.installationId = id();
      await local.set({ installationId: settings.installationId });
    }
    await migrateLegacyTotals();
    const cleaned = await cleanupExpiredSessions();
    if (!cleaned) await rebuildProjections();
    const marker = (await store.all("meta")).find((item) => item.key === "tracking-state");
    if (marker?.value && accountOf(marker.value) === settings.accountId) {
      currentState = marker.value.state;
      const persistedAt = typeof marker.value.activeSince === "number" ? marker.value.activeSince : Date.parse(marker.value.activeSince);
      if (now() - persistedAt > MAX_ELAPSED_SECONDS * 1_000) {
        currentState = stateForTab(null);
        activeSince = now();
      } else {
        activeSince = Number.isFinite(persistedAt) ? persistedAt : now();
      }
    } else {
      currentState = stateForTab(null);
      activeSince = now();
    }
    await adapter.scheduleUpload?.(UPLOAD_ALARM, UPLOAD_PERIOD_MINUTES);
    await reconcile();
  }

  async function refreshSettings() {
    const nativeSettings = await adapter.loadSettings?.();
    if (!nativeSettings) return false;
    await settle();
    settings = normalizeSettings({
      ...settings,
      ...settingsDefaults,
      ...(nativeSettings.settings ?? nativeSettings)
    });
    currentState = trackingActive() ? await adapter.getActiveState?.() ?? stateForTab(null) : stateForTab(null);
    activeSince = now();
    await store.put("meta", { key: "tracking-state", value: { accountId: settings.accountId, state: currentState, activeSince } });
    return true;
  }

  adapter.subscribeToActivity?.(() => run(() => reconcile(false)));
  adapter.subscribeToOnline?.(() => run(recoverFailedOnSignal));
  adapter.subscribeToWake?.(() => run(async () => { await refreshSettings(); await reconcile(); }));
  adapter.subscribeToUpload?.((name) => name === UPLOAD_ALARM
    ? run(async () => { await refreshSettings(); await reconcile(); })
    : undefined);
  adapter.subscribeToMessages?.((message, _sender, sendResponse) => {
    if (message?.type === "getStatus") { sendResponse(getStatus()); return false; }
    if (message?.type === "getUsage") {
      ready.then(async () => { await recoverFailedOnSignal(); sendResponse(Object.values(aggregateCache).filter(visible)); }).catch(() => sendResponse([]));
      return true;
    }
    if (message?.type === "getSessions") {
      ready.then(async () => sendResponse((await store.all("activitySessions")).filter(visible))).catch(() => sendResponse([]));
      return true;
    }
    if (message?.type === "getOutbox") {
      ready.then(async () => sendResponse((await store.all("syncOutbox")).filter(visible))).catch(() => sendResponse([]));
      return true;
    }
    if (message?.type === "retrySync") { run(retryFailed).then(sendResponse); return true; }
    if (message?.type === "online") { run(recoverFailedOnSignal).then(sendResponse); return true; }
    if (message?.type === "clearUsage") { run(() => clearLocalRange(message.from, message.to, message.all === true)).then(sendResponse); return true; }
    if (message?.type === "resetUsage") { run(resetUsage).then(sendResponse); return true; }
    if (message?.type === "saveSettings") { run(() => saveSettings(message.settings)).then(sendResponse); return true; }
    return false;
  });

  const ready = run(initialize);
  return {
    ready,
    getStatus,
    reconcile: (shouldUpload = true) => run(() => reconcile(shouldUpload)),
    upload: () => run(upload),
    saveSettings: (next) => run(() => saveSettings(next)),
    getTotals: () => Object.fromEntries(Object.entries(aggregateCache).filter(([, row]) => visible(row)))
  };
}
