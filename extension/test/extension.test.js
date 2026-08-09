import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addElapsed, normalizeApiBaseUrl, normalizeHostname, normalizeTrackedUrl, pruneTotals, stateForTab } from "../activity.js";
import { createController } from "../service-worker.js";

const extensionDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("keeps only eligible normalized hostnames", () => {
  assert.equal(normalizeHostname("HTTPS://Docs.Swift.org:443/path?q=1#x"), "docs.swift.org");
  assert.equal(normalizeHostname("file:///tmp/note"), null);
  assert.deepEqual(normalizeTrackedUrl("https://user:secret@Example.com/path?q=1#section"), {
    hostname: "example.com",
    url: "https://example.com/path?q=1"
  });
  assert.deepEqual(stateForTab({ url: "https://example.com/private", incognito: true }), {
    hostname: "example.com",
    url: "https://example.com/private"
  });
});

test("accepts only HTTP(S) backend URLs", () => {
  assert.equal(normalizeApiBaseUrl("https://api.example.com/"), "https://api.example.com");
  assert.equal(normalizeApiBaseUrl("http://localhost:3000/api/"), "http://localhost:3000/api");
  assert.equal(normalizeApiBaseUrl("file:///tmp/api"), "");
});

test("aggregates elapsed active seconds and caps suspended time", () => {
  const totals = {};
  addElapsed(totals, { hostname: "example.com", url: "https://example.com/" }, 0, 31_000);
  addElapsed(totals, { hostname: "example.com", url: "https://example.com/" }, 31_000, 151_000);
  assert.equal(Object.values(totals)[0].activeSeconds, 91);
});

test("keeps failed website uploads in browser storage until retry", async () => {
  let clock = Date.parse("2026-08-09T12:00:00Z");
  const api = fakeApi({
    websiteTrackingEnabled: true,
    apiBaseUrl: "https://api.example.com",
    dsnKey: `itu_dsn_${"a".repeat(43)}`,
    installationId: "123e4567-e89b-42d3-a456-426614174000"
  });
  const controller = createController(api, { now: () => clock, fetch: async () => { throw new Error("offline"); } });
  await controller.ready;
  clock += 31_000;
  await controller.reconcile();

  assert.equal(api.state.totals[Object.keys(api.state.totals)[0]].url, "https://example.com/path");

  const requests = [];
  const restarted = createController(api, {
    now: () => clock,
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ accepted: true }) };
    }
  });
  await restarted.ready;
  assert.equal(requests.at(-1).summaries[0].url, "https://example.com/path");
  assert.equal(requests.at(-1).summaries[0].activeSeconds, 31);
});

test("prunes website summaries older than the local retention window", () => {
  const now = Date.parse("2026-08-09T12:00:00Z");
  const totals = {
    old: { localDate: "2026-08-02" },
    current: { localDate: "2026-08-03" }
  };
  pruneTotals(totals, now);
  assert.deepEqual(Object.keys(totals), ["current"]);
});

test("keeps URL paths separate while retaining their hostname", () => {
  const totals = {};
  addElapsed(totals, stateForTab({ url: "https://example.com/one" }), 0, 10_000);
  addElapsed(totals, stateForTab({ url: "https://example.com/two?q=1" }), 10_000, 30_000);
  addElapsed(totals, stateForTab({ url: "https://docs.example.com/one" }), 30_000, 40_000);

  const summaries = Object.values(totals).sort((left, right) => left.url.localeCompare(right.url));
  assert.deepEqual(summaries.map(({ hostname, url, activeSeconds }) => ({ hostname, url, activeSeconds })), [
    { hostname: "docs.example.com", url: "https://docs.example.com/one", activeSeconds: 10 },
    { hostname: "example.com", url: "https://example.com/one", activeSeconds: 10 },
    { hostname: "example.com", url: "https://example.com/two?q=1", activeSeconds: 20 }
  ]);
});

function event() {
  return { listeners: [], addListener(listener) { this.listeners.push(listener); } };
}

function fakeApi(stored = {}) {
  const state = { ...stored };
  return {
    tabs: { onActivated: event(), onUpdated: event() },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: event(),
      getLastFocused: async () => ({ focused: true, tabs: [{ active: true, url: "https://example.com/path" }] })
    },
    alarms: { onAlarm: event(), create: async () => {} },
    runtime: { onMessage: event(), sendMessage: async () => {} },
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...state }),
        set: async (changes) => Object.assign(state, changes)
      }
    },
    state
  };
}

test("uploads cumulative summaries directly with DSN authentication", async () => {
  let clock = 1_700_000_000_000;
  const api = fakeApi({
    websiteTrackingEnabled: true,
    apiBaseUrl: "https://api.example.com",
    dsnKey: `itu_dsn_${"a".repeat(43)}`,
    installationId: "123e4567-e89b-42d3-a456-426614174000"
  });
  const requests = [];
  const controller = createController(api, {
    now: () => clock,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, json: async () => ({ accepted: true, replaced: 1 }) };
    }
  });
  await controller.ready;
  clock += 31_000;
  await controller.reconcile();

  const request = requests.at(-1);
  const body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://api.example.com/usage/websites/ingest");
  assert.equal(request.init.headers.Authorization, `DSN itu_dsn_${"a".repeat(43)}`);
  assert.equal(body.installationId, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(body.summaries[0].hostname, "example.com");
  assert.equal(body.summaries[0].url, "https://example.com/path");
  assert.equal(body.summaries[0].activeSeconds, 31);
  assert.equal(controller.getStatus().status, "connected");
});

test("exposes persisted summaries to the popup after initialization", async () => {
  const api = fakeApi({
    websiteTrackingEnabled: true,
    apiBaseUrl: "https://api.example.com",
    dsnKey: `itu_dsn_${"a".repeat(43)}`,
    installationId: "123e4567-e89b-42d3-a456-426614174000"
  });
  const controller = createController(api, {
    fetch: async () => ({ ok: true, json: async () => ({ accepted: true }) })
  });
  await controller.ready;
  const listener = api.runtime.onMessage.listeners.at(-1);
  let summaries;
  assert.equal(listener({ type: "getUsage" }, {}, (value) => { summaries = value; }), true);
  await Promise.resolve();
  assert.deepEqual(summaries, Object.values(controller.getTotals()));
});

test("packaged manifest drops native messaging and requests backend access only when configured", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(extensionDirectory, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["tabs", "storage", "alarms"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.incognito, "spanning");
  assert.equal(manifest.permissions.includes("nativeMessaging"), false);
});
