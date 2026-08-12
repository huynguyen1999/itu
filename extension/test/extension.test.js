import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, mergeAdjacentSession, normalizeApiBaseUrl, normalizeIconUrl, normalizeTrackedUrl, projectAggregates, stateForTab } from "../activity.js";
import { createController } from "../service-worker.js";

const extensionDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("normalizes credentials, query and fragments while retaining the path", () => {
  assert.deepEqual(normalizeTrackedUrl("https://user:secret@Example.com/path?q=1#section"), { hostname: "example.com", url: "https://example.com/path" });
  assert.equal(normalizeTrackedUrl("file:///tmp/note"), null);
  assert.deepEqual(stateForTab({ url: "https://example.com/private", title: "Private", favIconUrl: "https://cdn.example.com/icon.png?cache=1", incognito: true }), { hostname: "example.com", url: "https://example.com/private", iconUrl: "https://cdn.example.com/icon.png", title: "Private", incognito: true });
  assert.equal(normalizeIconUrl("data:image/png;base64,abc"), null);
  assert.equal(normalizeIconUrl("https://cdn.example.com/icon.png?secret=1#hash"), "https://cdn.example.com/icon.png");
});

test("creates stable sessions and merges only adjacent matching privacy/browser rows", () => {
  const state = { hostname: "example.com", url: "https://example.com/path", iconUrl: "https://example.com/icon.png", title: "Page", incognito: false };
  const first = createSession(state, 0, 4_000, "stable");
  assert.equal(first.id, "stable");
  const merged = mergeAdjacentSession(first, createSession({ ...state, iconUrl: null, title: "Updated" }, 4_000, 9_000, "other"));
  assert.equal(merged.activeSeconds, 9);
  assert.equal(merged.title, "Updated");
  assert.equal(merged.iconUrl, "https://example.com/icon.png");
  assert.equal(mergeAdjacentSession(createSession(state, 0, 60_000, "long"), createSession(state, 60_000, 120_000, "long-2")).activeSeconds, 120);
  assert.equal(mergeAdjacentSession(first, createSession({ ...state, incognito: true }, 4_000, 9_000, "other")), null);
  assert.equal(createSession(state, 0, 2_999, "short"), null);
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
