import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createActivityStore, createSession, mergeAdjacentSession, normalizeApiBaseUrl, normalizeIconUrl, normalizeTrackedUrl, projectAggregates, retryDelay, stateForTab } from "../activity.js";
import { createController as createCoreController } from "../controller.js";
import { SAFARI_IDENTITY, createSafariAdapter } from "../safari/adapter.js";
import { createController } from "../service-worker.js";

const extensionDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("normalizes credentials, query and fragments while retaining the path", () => {
  assert.deepEqual(normalizeTrackedUrl("https://user:secret@Example.com/path?q=1#section"), { hostname: "example.com", url: "https://example.com/path" });
  assert.deepEqual(normalizeTrackedUrl("HTTP://Example.COM./Path"), { hostname: "example.com", url: "http://example.com/Path" });
  assert.equal(normalizeTrackedUrl("file:///tmp/note"), null);
  assert.deepEqual(stateForTab({ url: "https://example.com/private", title: "Private", favIconUrl: "https://cdn.example.com/icon.png?cache=1", incognito: true }), { hostname: "example.com", url: "https://example.com/private", iconUrl: "https://cdn.example.com/icon.png", title: "Private", incognito: true });
  assert.equal(normalizeIconUrl("data:image/png;base64,abc"), null);
  assert.equal(normalizeIconUrl("https://cdn.example.com/icon.png?secret=1#hash"), "https://cdn.example.com/icon.png");
});

test("creates stable sessions and merges only adjacent matching privacy/browser rows", () => {
  const state = { hostname: "example.com", url: "https://example.com/path", iconUrl: "https://example.com/icon.png", title: "Page", incognito: false };
  const first = createSession(state, 0, 4_000, "stable", { bundleId: "browser.test", displayName: "Test Browser" });
  assert.equal(first.id, "stable");
  const merged = mergeAdjacentSession(first, createSession({ ...state, iconUrl: null, title: "Updated" }, 4_000, 9_000, "other", { bundleId: "browser.test", displayName: "Test Browser" }));
  assert.equal(merged.activeSeconds, 9);
  assert.equal(merged.title, "Updated");
  assert.equal(merged.iconUrl, "https://example.com/icon.png");
  assert.equal(mergeAdjacentSession(createSession(state, 0, 60_000, "long", { bundleId: "browser.test", displayName: "Test Browser" }), createSession(state, 60_000, 120_000, "long-2", { bundleId: "browser.test", displayName: "Test Browser" })).activeSeconds, 120);
  assert.equal(mergeAdjacentSession(first, createSession({ ...state, incognito: true }, 4_000, 9_000, "other", { bundleId: "browser.test", displayName: "Test Browser" })), null);
  assert.equal(createSession(state, 0, 2_999, "short"), null);
});

test("keeps browser identities separate and merges exactly at the 30-second boundary", () => {
  const state = { hostname: "example.com", url: "https://example.com/path", title: "Page", incognito: false };
  const chrome = createSession(state, 0, 3_000, "chrome", { bundleId: "com.google.chrome", displayName: "Google Chrome" });
  const edge = createSession(state, 3_000, 6_000, "edge", { bundleId: "com.microsoft.edgemac", displayName: "Microsoft Edge" });
  assert.equal(mergeAdjacentSession(chrome, edge), null);
  const adjacent = createSession(state, 33_000, 36_000, "adjacent", { bundleId: "com.google.chrome", displayName: "Google Chrome" });
  assert.equal(mergeAdjacentSession(chrome, adjacent).activeSeconds, 6);
  assert.equal(createSession(state, 0, 3_000, "chrome").activeSeconds, 3);
});

test("projects daily URL and domain totals from raw sessions without retention pruning", () => {
  const rows = [
    createSession({ hostname: "example.com", url: "https://example.com/a", title: "A", incognito: false }, 0, 4_000, "a"),
    createSession({ hostname: "example.com", url: "https://example.com/b", title: "B", incognito: false }, 4_000, 10_000, "b")
  ];
  const projection = projectAggregates(rows);
  assert.equal(projection.urls.length, 2);
  assert.equal(projection.domains[0].activeSeconds, 10);
  assert.equal(projectAggregates([...rows, createSession({ hostname: "example.com", url: "https://example.com/a", title: "Private", incognito: true }, 10_000, 14_000, "private")]).urls.length, 3);
});

function event() { return { listeners: [], addListener(listener) { this.listeners.push(listener); } }; }
function fakeApi(stored = {}) {
  const state = { ...stored };
  return {
    tabs: { onActivated: event(), onUpdated: event() },
    windows: { onFocusChanged: event(), getLastFocused: async () => ({ focused: true, tabs: [{ active: true, url: "https://example.com/path?q=1", title: "Page", incognito: true }] }) },
    alarms: { onAlarm: event(), create: async () => {} }, runtime: { onMessage: event(), sendMessage: async () => {} },
    storage: { local: { get: async (defaults) => ({ ...defaults, ...state }), set: async (changes) => Object.assign(state, changes) } }, state
  };
}

function fakeSafariApi(stored = {}, incognito = true) {
  const api = fakeApi(stored);
  api.windows.getLastFocused = async () => ({ focused: true, tabs: [{ active: true, url: "https://example.com/path", title: "Page", incognito }] });
  api.runtime.onStartup = event();
  return api;
}

test("migrates legacy aggregates without fabricating upload sessions", async () => {
  const api = fakeApi({ totals: { old: { localDate: "2026-08-01", hostname: "old.example", url: "https://old.example/path", activeSeconds: 12 } } });
  const controller = createController(api, { now: () => Date.parse("2026-08-09T12:00:00Z"), fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) }) });
  await controller.ready;
  const listener = api.runtime.onMessage.listeners.at(-1);
  const usage = await new Promise((resolve) => listener({ type: "getUsage" }, {}, resolve));
  const sessions = await new Promise((resolve) => listener({ type: "getSessions" }, {}, resolve));
  assert.equal(usage.find((row) => row.hostname === "old.example").activeSeconds, 12);
  assert.equal(sessions.length, 0);
  assert.equal(api.state.migrationVersion, 2);
  assert.equal("totals" in api.state, false);
});

test("uploads at most session batches and keeps rejected records failed", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const requests = [];
  const controller = createController(api, { now: () => clock, fetch: async (url, init) => { requests.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ accepted: [], rejected: [{ id: JSON.parse(init.body).sessions[0].id, reason: "invalid" }] }) }; } });
  await controller.ready; clock += 5_000; await controller.reconcile();
  assert.equal(requests.at(-1)[0], "https://api.example.com/usage/websites/sessions/ingest");
  assert.equal(requests.at(-1)[1].installationId, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(requests.at(-1)[1].sessions[0].isPrivate, true);
  const firstSessionId = requests.at(-1)[1].sessions[0].id;
  const outbox = await new Promise((resolve) => api.runtime.onMessage.listeners.at(-1)({ type: "getOutbox" }, {}, resolve));
  assert.equal(firstSessionId, outbox[0].sessionId);
  assert.equal(outbox[0].state, "FAILED");
  assert.equal(outbox[0].retryable, false);
  await new Promise((resolve) => api.runtime.onMessage.listeners.at(-1)({ type: "getUsage" }, {}, resolve));
  const afterWake = await new Promise((resolve) => api.runtime.onMessage.listeners.at(-1)({ type: "getOutbox" }, {}, resolve));
  assert.equal(afterWake[0].state, "FAILED");
});

test("settlement updates URL/domain projections incrementally without drift", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const controller = createController(api, { now: () => clock, fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) }) });
  await controller.ready; clock += 5_000; await controller.reconcile(false); clock += 5_000; await controller.reconcile(false);
  const usage = Object.values(controller.getTotals());
  assert.equal(usage.length, 1);
  assert.equal(usage[0].activeSeconds, 10);
});

test("clear removes selected activity but reset also removes connection settings", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const controller = createController(api, { now: () => clock, fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) }) });
  await controller.ready; clock += 5_000; await controller.reconcile();
  const listener = api.runtime.onMessage.listeners.at(-1);
  await new Promise((resolve) => listener({ type: "clearUsage", from: "2026-08-09", to: "2026-08-09" }, {}, resolve));
  assert.equal(api.state.apiBaseUrl, "https://api.example.com");
  assert.equal((await new Promise((resolve) => listener({ type: "getOutbox" }, {}, resolve))).length, 0);
  await new Promise((resolve) => listener({ type: "resetUsage" }, {}, resolve));
  assert.equal(api.state.apiBaseUrl, "http://localhost:3000");
  assert.equal(api.state.dsnKey, "");
  assert.equal(api.state.websiteTrackingEnabled, false);
  assert.notEqual(api.state.installationId, "123e4567-e89b-42d3-a456-426614174000");
});

test("failed retry waits for the manual connectivity signal", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z"); let calls = 0;
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const controller = createController(api, { now: () => clock, fetch: async () => { calls += 1; throw new Error("offline"); } });
  await controller.ready; clock += 5_000; await controller.reconcile();
  await controller.upload(); assert.equal(calls, 1);
  const listener = api.runtime.onMessage.listeners.at(-1);
  await new Promise((resolve) => listener({ type: "retrySync" }, {}, resolve));
  assert.equal(calls, 2);
});

test("a connectivity signal on popup wake requeues FAILED records once", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z"); let calls = 0;
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const controller = createController(api, { now: () => clock, fetch: async () => { calls += 1; throw new Error("offline"); } });
  await controller.ready; clock += 5_000; await controller.reconcile();
  for (let attempt = 0; attempt < 3; attempt += 1) { clock += 10_000; await controller.upload(); }
  assert.equal(calls, 4);
  const listener = api.runtime.onMessage.listeners.at(-1);
  await new Promise((resolve) => listener({ type: "getUsage" }, {}, resolve));
  assert.equal(calls, 5);
});

test("caps automatic retries at the initial attempt plus three retries", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  let calls = 0;
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const controller = createController(api, { now: () => clock, fetch: async () => { calls += 1; throw new Error("offline"); } });
  await controller.ready;
  clock += 5_000;
  await controller.reconcile();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    clock += 10_000;
    await controller.upload();
  }
  assert.equal(calls, 4);
  const outbox = await new Promise((resolve) => api.runtime.onMessage.listeners.at(-1)({ type: "getOutbox" }, {}, resolve));
  assert.equal(outbox[0].state, "FAILED");
  clock += 10_000;
  await controller.upload();
  assert.equal(calls, 4);
  await controller.reconcile();
  assert.equal(calls, 4);
});

test("manifest requests unlimited local storage and no native messaging", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(extensionDirectory, "manifest.json"), "utf8"));
  assert.equal(manifest.permissions.includes("unlimitedStorage"), true);
  assert.equal(manifest.permissions.includes("nativeMessaging"), false);
  assert.equal(manifest.incognito, "spanning");
});

test("uses deterministic 2/4/8 second retry delays and caps uploads at 100 sessions", async () => {
  assert.deepEqual([1, 2, 3].map((attempt) => retryDelay(attempt, () => 0)), [2_000, 4_000, 8_000]);
  const store = createActivityStore({});
  const payloads = Array.from({ length: 101 }, (_, index) => ({
    id: `session-${index}`,
    startedAt: "2026-08-09T12:00:00.000Z",
    endedAt: "2026-08-09T12:00:03.000Z",
    browserBundleId: "browser.test",
    browserDisplayName: "Test Browser",
    hostname: "example.com",
    url: "https://example.com/path",
    isPrivate: false,
    timezone: "UTC"
  }));
  for (const [index, payload] of payloads.entries()) await store.put("syncOutbox", { id: `session:${payload.id}`, sessionId: payload.id, payload, state: "PENDING", attempts: 0, nextAttemptAt: 0, updatedAt: index });
  let uploaded = 0;
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const controller = createController(api, {
    store,
    now: () => Date.parse("2026-08-09T12:00:00Z"),
    fetch: async (_url, init) => {
      const request = JSON.parse(init.body);
      uploaded = request.sessions.length;
      return { ok: true, json: async () => ({ accepted: request.sessions.map((session) => session.id) }) };
    }
  });
  await controller.ready;
  assert.equal(uploaded, 100);
});

test("marks every blocking response as non-retryable configuration error", async () => {
  for (const responseStatus of [400, 401, 403, 404, 422]) {
    let clock = Date.parse("2026-08-09T12:00:00Z");
    const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
    const controller = createController(api, { now: () => clock, fetch: async () => ({ ok: false, status: responseStatus }) });
    await controller.ready;
    clock += 5_000;
    await controller.reconcile();
    const outbox = await new Promise((resolve) => api.runtime.onMessage.listeners.at(-1)({ type: "getOutbox" }, {}, resolve));
    assert.equal(outbox[0].state, "BLOCKED");
    assert.equal(outbox[0].retryable, false);
    assert.equal(outbox[0].error, `HTTP ${responseStatus}`);
    assert.equal(controller.getStatus().status, "configuration needed");
  }
});

test("recovers persisted tracking state and outbox after a worker restart", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const store = createActivityStore({});
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "123e4567-e89b-42d3-a456-426614174000" });
  const first = createController(api, { store, now: () => clock, fetch: async () => { throw new Error("offline"); } });
  await first.ready;
  clock += 5_000;
  await first.reconcile();
  assert.equal((await store.all("syncOutbox")).length, 1);

  clock += 5_000;
  const second = createController(api, {
    store,
    now: () => clock,
    fetch: async (_url, init) => ({ ok: true, json: async () => ({ accepted: JSON.parse(init.body).sessions.map((session) => session.id) }) })
  });
  await second.ready;
  assert.equal((await store.all("syncOutbox")).length, 0);
  assert.equal(Object.values(second.getTotals())[0].activeSeconds, 10);
});

test("Safari and Chromium share session logic while keeping their identities distinct", () => {
  const state = { hostname: "example.com", url: "https://example.com/path", title: "Page", incognito: false };
  const chromium = createSession(state, 0, 4_000, "chromium", { bundleId: "com.microsoft.edgemac", displayName: "Microsoft Edge" });
  const safari = createSession(state, 0, 4_000, "safari", SAFARI_IDENTITY);
  assert.deepEqual(SAFARI_IDENTITY, { bundleId: "com.apple.mobilesafari", displayName: "Safari" });
  assert.deepEqual({ ...chromium, id: "same", browserBundleId: undefined, browserDisplayName: undefined }, { ...safari, id: "same", browserBundleId: undefined, browserDisplayName: undefined });
  assert.notEqual(chromium.browserBundleId, safari.browserBundleId);
});

test("Safari loads native configuration without relaying sessions", async () => {
  const api = fakeSafariApi();
  let nativeRequest;
  api.runtime.sendNativeMessage = async (host, message) => {
    nativeRequest = { host, message };
    return { trackingEnabled: true, accountId: "safari-account", installationId: "installation" };
  };
  const adapter = createSafariAdapter(api);
  assert.deepEqual(await adapter.loadSettings(), {
    trackingEnabled: true,
    websiteTrackingEnabled: true,
    accountId: "safari-account",
    installationId: "installation"
  });
  assert.deepEqual(nativeRequest, { host: "com.itu.ios", message: { type: "getConfiguration" } });
});

test("Safari refreshes native configuration on its upload wake", async () => {
  const api = fakeSafariApi();
  let configuration = { trackingEnabled: false, accountId: "", installationId: "" };
  api.runtime.sendNativeMessage = async () => configuration;
  const controller = createCoreController(createSafariAdapter(api), {
    store: createActivityStore({}),
    fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) })
  });
  await controller.ready;
  assert.equal(controller.getStatus().websiteTrackingEnabled, false);

  configuration = {
    trackingEnabled: true,
    accountId: "account-a",
    installationId: "installation-a",
    dsnKey: "itu_dsn_test",
    apiBaseUrl: "https://api.example.com",
    uploadEnabled: true
  };
  api.alarms.onAlarm.listeners[0]({ name: "upload-browser-activity" });
  await controller.reconcile(false);
  assert.equal(controller.getStatus().websiteTrackingEnabled, true);
});

test("Safari manifest permits native configuration messaging", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(extensionDirectory, "safari", "manifest.json"), "utf8"));
  assert.equal(manifest.permissions.includes("nativeMessaging"), true);
  assert.deepEqual(manifest.host_permissions, ["http://*/*", "https://*/*"]);
});

test("keeps account queues isolated when the active account changes", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const store = createActivityStore({});
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "installation" });
  const requests = [];
  const controller = createController(api, {
    store,
    now: () => clock,
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      return { ok: true, json: async () => ({ accepted: body.sessions.map((session) => session.id) }) };
    }
  });
  await controller.ready;
  clock += 5_000;
  await controller.reconcile(false);
  await controller.saveSettings({ accountId: "account-b" });
  clock += 5_000;
  await controller.reconcile(false);
  await controller.upload();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].sessions.length, 1);
  assert.equal((await store.all("syncOutbox")).length, 1);
  assert.equal((await store.all("activitySessions")).map((row) => row.accountId).sort().join(","), "account-b,default");
});

test("logout pauses upload without losing local records, then relogin flushes the same account", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const store = createActivityStore({});
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "installation" });
  let calls = 0;
  const controller = createController(api, {
    store,
    now: () => clock,
    fetch: async (_url, init) => {
      calls += 1;
      return { ok: true, json: async () => ({ accepted: JSON.parse(init.body).sessions.map((session) => session.id) }) };
    }
  });
  await controller.ready;
  clock += 5_000;
  await controller.reconcile(false);
  await controller.saveSettings({ uploadEnabled: false });
  assert.equal(calls, 0);
  assert.equal((await store.all("syncOutbox")).length, 1);
  assert.equal(controller.getStatus().status, "paused");
  await controller.saveSettings({ uploadEnabled: true });
  assert.equal(calls, 1);
  assert.equal((await store.all("syncOutbox")).length, 0);
});

test("Safari defaults private tracking off", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const api = fakeSafariApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "installation" });
  const store = createActivityStore({});
  const controller = createCoreController(createSafariAdapter(api), {
    store,
    now: () => clock,
    fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) })
  });
  await controller.ready;
  clock += 5_000;
  await controller.reconcile(false);
  assert.equal((await store.all("activitySessions")).length, 0);
  assert.equal((await store.all("syncOutbox")).length, 0);
});

test("discards a persisted active interval older than one minute after restart", async () => {
  const now = Date.parse("2026-08-09T12:00:00Z");
  const store = createActivityStore({});
  await store.put("meta", {
    key: "tracking-state",
    value: {
      state: { hostname: "example.com", url: "https://example.com/path", title: "Page", iconUrl: null, incognito: false },
      activeSince: now - 60_001
    }
  });
  const api = fakeApi({ websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "installation" });
  const controller = createController(api, { store, now: () => now, fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) }) });
  await controller.ready;
  assert.equal((await store.all("activitySessions")).length, 0);
});

test("does not carry the previous account's active interval across restart", async () => {
  const now = Date.parse("2026-08-09T12:00:00Z");
  const store = createActivityStore({});
  await store.put("meta", {
    key: "tracking-state",
    value: {
      accountId: "account-a",
      state: { hostname: "example.com", url: "https://example.com/path", title: "Page", iconUrl: null, incognito: false },
      activeSince: now - 5_000
    }
  });
  const api = fakeApi({ accountId: "account-b", websiteTrackingEnabled: true, apiBaseUrl: "https://api.example.com", dsnKey: "dsn", installationId: "installation" });
  const controller = createController(api, { store, now: () => now, fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) }) });
  await controller.ready;
  assert.equal((await store.all("activitySessions")).length, 0);
});

test("retains old unacknowledged sessions but removes old acknowledged sessions", async () => {
  const now = Date.parse("2026-08-09T12:00:00Z");
  const old = now - 91 * 86_400_000;
  const store = createActivityStore({});
  const session = (id) => ({
    id,
    accountId: "default",
    startedAt: old - 3_000,
    endedAt: old,
    activeSeconds: 3,
    localDate: "2026-05-10",
    timezone: "UTC",
    browserBundleId: "com.microsoft.edgemac",
    browserDisplayName: "Microsoft Edge",
    hostname: "example.com",
    url: `https://example.com/${id}`,
    iconUrl: null,
    title: "Page",
    incognito: false
  });
  await store.put("activitySessions", session("acked"));
  await store.put("activitySessions", session("pending"));
  await store.put("syncOutbox", { id: "session:pending", sessionId: "pending", accountId: "default", state: "RETRY", payload: {}, attempts: 1, nextAttemptAt: 0, updatedAt: old });
  const api = fakeApi();
  const controller = createController(api, { store, now: () => now, fetch: async () => ({ ok: true, json: async () => ({ accepted: [] }) }) });
  await controller.ready;
  assert.deepEqual((await store.all("activitySessions")).map((row) => row.id), ["pending"]);
  assert.equal(Object.values(controller.getTotals())[0].url, "https://example.com/pending");
});

test("activity page provides submit filter button and opens calendar on click", async () => {
  const html = await fs.readFile(path.join(extensionDirectory, "activity.html"), "utf8");
  const js = await fs.readFile(path.join(extensionDirectory, "activity-page.js"), "utf8");

  assert.match(html, /<form[^>]*id="filter-form"/);
  assert.match(html, /<button[^>]*id="submit-filter"[^>]*type="submit"[^>]*>\s*Submit filter\s*<\/button>/);
  assert.match(html, /<input[^>]*id="from"[^>]*type="date"/);
  assert.match(html, /<input[^>]*id="to"[^>]*type="date"/);
  assert.match(js, /querySelector\(["']#filter-form["']\)/);
  assert.match(js, /addEventListener\(["']submit["']/);
  assert.match(js, /showPicker/);
});
