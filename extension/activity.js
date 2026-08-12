export const BROWSER_BUNDLE_ID = "com.microsoft.edgemac";
export const BROWSER_DISPLAY_NAME = "Microsoft Edge";
export const UPLOAD_ALARM = "upload-browser-activity";
export const UPLOAD_PERIOD_MINUTES = 0.5;
export const MAX_ELAPSED_SECONDS = 60;
export const SESSION_MIN_SECONDS = 3;
export const SESSION_MERGE_GAP_MS = 30_000;
export const DB_NAME = "itu-browser-activity";
export const DB_VERSION = 1;
export const STORE_NAMES = ["activitySessions", "dailyUrlAggregates", "dailyDomainAggregates", "syncOutbox", "legacyAggregates", "meta"];

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

export function normalizeHostname(value) {
  return normalizeTrackedUrl(value)?.hostname ?? null;
}

/** Normalized URL intentionally excludes credentials, query strings and fragments. */
export function normalizeTrackedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
    if (!hostname) return null;
    url.hostname = hostname;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const normalizedUrl = url.toString();
    if (normalizedUrl.length > 2048) return null;
    return { hostname, url: normalizedUrl };
  } catch {
    return null;
  }
}

export function normalizeIconUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const normalizedUrl = url.toString();
    return normalizedUrl.length <= 2048 ? normalizedUrl : null;
  } catch {
    return null;
  }
}

export function normalizeApiBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

export function stateForTab(tab) {
  const normalized = tab && normalizeTrackedUrl(tab.url);
  if (!normalized) return { hostname: null, url: null, iconUrl: null, title: "", incognito: Boolean(tab?.incognito) };
  return {
    ...normalized,
    iconUrl: normalizeIconUrl(tab.favIconUrl),
    title: String(tab.title ?? "").slice(0, 500),
    incognito: Boolean(tab.incognito)
  };
}

export function localDate(at = Date.now()) {
  const date = new Date(at);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function addElapsed(totals, state, startedAt, endedAt) {
  const elapsed = Math.min(MAX_ELAPSED_SECONDS, Math.floor((endedAt - startedAt) / 1000));
  if (!state?.hostname || !state?.url || elapsed <= 0) return totals;
  const key = `${localDate(endedAt)}\u0000${BROWSER_BUNDLE_ID}\u0000${state.url}`;
  const current = totals[key];
  totals[key] = {
    localDate: localDate(endedAt), browserBundleId: BROWSER_BUNDLE_ID,
    browserDisplayName: BROWSER_DISPLAY_NAME, hostname: state.hostname, url: state.url,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    activeSeconds: Math.min(86_400, (current?.activeSeconds ?? 0) + elapsed)
  };
  return totals;
}

export function sameSession(left, right) {
  return Boolean(left && right && left.url === right.url && left.incognito === right.incognito && left.browserBundleId === right.browserBundleId);
}

export function createSession(state, startedAt, endedAt, id = globalThis.crypto?.randomUUID?.() ?? `session-${startedAt}`) {
  const activeSeconds = Math.min(MAX_ELAPSED_SECONDS, Math.floor((endedAt - startedAt) / 1000));
  if (!state?.url || activeSeconds < SESSION_MIN_SECONDS) return null;
  return {
    id, startedAt, endedAt, activeSeconds, localDate: localDate(startedAt),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    browserBundleId: BROWSER_BUNDLE_ID, browserDisplayName: BROWSER_DISPLAY_NAME,
    hostname: state.hostname, url: state.url, iconUrl: state.iconUrl ?? null, title: state.title ?? "", incognito: Boolean(state.incognito)
  };
}

export function mergeAdjacentSession(previous, next) {
  if (!sameSession(previous, next) || next.startedAt < previous.endedAt || next.startedAt - previous.endedAt > SESSION_MERGE_GAP_MS) return null;
  const endedAt = Math.max(previous.endedAt, next.endedAt);
  return {
    ...previous,
    endedAt,
    activeSeconds: Math.min(86_400, previous.activeSeconds + next.activeSeconds),
    iconUrl: next.iconUrl || previous.iconUrl || null,
    title: next.title || previous.title
  };
}

export function projectAggregates(sessions) {
  const urls = new Map();
  const domains = new Map();
  for (const session of sessions) {
    const urlKey = [session.localDate, session.browserBundleId, session.url, session.incognito ? "private" : "normal"].join("\u0000");
    const url = urls.get(urlKey) ?? { key: urlKey, localDate: session.localDate, browserBundleId: session.browserBundleId, browserDisplayName: session.browserDisplayName, hostname: session.hostname, url: session.url, timezone: session.timezone, incognito: Boolean(session.incognito), activeSeconds: 0 };
    url.activeSeconds += session.activeSeconds; urls.set(urlKey, url);
    const domainKey = [session.localDate, session.browserBundleId, session.hostname, session.incognito ? "private" : "normal"].join("\u0000");
    const domain = domains.get(domainKey) ?? { key: domainKey, localDate: session.localDate, browserBundleId: session.browserBundleId, browserDisplayName: session.browserDisplayName, hostname: session.hostname, timezone: session.timezone, incognito: Boolean(session.incognito), activeSeconds: 0 };
    domain.activeSeconds += session.activeSeconds; domains.set(domainKey, domain);
  }
  return { urls: [...urls.values()], domains: [...domains.values()] };
}

function request(db, mode, storeName, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try { result = action(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
  });
}

function indexedStore(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) return null;
  let opening;
  const open = () => opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("activitySessions")) db.createObjectStore("activitySessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("dailyUrlAggregates")) db.createObjectStore("dailyUrlAggregates", { keyPath: "key" });
      if (!db.objectStoreNames.contains("dailyDomainAggregates")) db.createObjectStore("dailyDomainAggregates", { keyPath: "key" });
      if (!db.objectStoreNames.contains("legacyAggregates")) db.createObjectStore("legacyAggregates", { keyPath: "key" });
      if (!db.objectStoreNames.contains("syncOutbox")) db.createObjectStore("syncOutbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    async all(store) { return request(await open(), "readonly", store, (s) => s.getAll()); },
    async put(store, value) { return request(await open(), "readwrite", store, (s) => s.put(value)); },
    async delete(store, key) { return request(await open(), "readwrite", store, (s) => s.delete(key)); },
    async clear(store) { return request(await open(), "readwrite", store, (s) => s.clear()); }
  };
}

function memoryStore(seed = {}) {
  const data = { activitySessions: new Map(), dailyUrlAggregates: new Map(), dailyDomainAggregates: new Map(), legacyAggregates: new Map(), syncOutbox: new Map(), meta: new Map(), ...seed };
  const values = (store) => [...data[store].values()];
  return {
    data,
    async all(store) { return values(store); },
    async put(store, value) { data[store].set(value.id ?? value.key, structuredClone(value)); return value; },
    async delete(store, key) { data[store].delete(key); },
    async clear(store) { data[store].clear(); }
  };
}

const storeOwners = new WeakMap();
export function createActivityStore(api = null) {
  if (!api) return indexedStore() ?? memoryStore();
  if (!storeOwners.has(api)) storeOwners.set(api, indexedStore() ?? memoryStore());
  return storeOwners.get(api);
}

export function retryDelay(attempt, random = Math.random) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length) - 1] + Math.floor(random() * 250);
}

export { RETRY_DELAYS_MS };
