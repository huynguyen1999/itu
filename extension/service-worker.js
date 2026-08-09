import {
  UPLOAD_ALARM,
  UPLOAD_PERIOD_MINUTES,
  addElapsed,
  normalizeApiBaseUrl,
  pruneTotals,
  stateForTab
} from "./activity.js";

const DEFAULT_SETTINGS = {
  websiteTrackingEnabled: false,
  apiBaseUrl: "http://localhost:3000",
  dsnKey: "",
  installationId: ""
};

export function createController(api, dependencies = {}) {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  let settings = { ...DEFAULT_SETTINGS };
  let totals = {};
  let currentState = stateForTab(null);
  let activeSince = now();
  let status = "paused";
  let operation = Promise.resolve();

  const run = (work) => (operation = operation.then(work, work));
  const configured = () => Boolean(normalizeApiBaseUrl(settings.apiBaseUrl) && settings.dsnKey);

  function getStatus() {
    return {
      status: !settings.websiteTrackingEnabled ? "paused" : configured() ? status : "configuration needed",
      websiteTrackingEnabled: settings.websiteTrackingEnabled,
      apiBaseUrl: settings.apiBaseUrl,
      dsnKey: settings.dsnKey
    };
  }

  function notifyStatus() {
    api.runtime.sendMessage({ type: "status", status: getStatus() }).catch(() => {});
  }

  async function persist(at = now()) {
    pruneTotals(totals, at);
    await api.storage.local.set({ totals, trackingState: { ...currentState, activeSince: at } });
  }

  function settle(at = now()) {
    addElapsed(totals, currentState, activeSince, at);
    activeSince = at;
  }

  async function activeTabState() {
    try {
      const window = await api.windows.getLastFocused({ populate: true });
      if (window?.focused === false) return stateForTab(null);
      return stateForTab(window?.tabs?.find((tab) => tab.active));
    } catch {
      return stateForTab(null);
    }
  }

  async function upload() {
    if (!settings.websiteTrackingEnabled || !configured()) {
      status = "paused";
      notifyStatus();
      return;
    }
    try {
      const response = await fetchRequest(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/usage/websites/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `DSN ${settings.dsnKey}` },
        body: JSON.stringify({ installationId: settings.installationId, summaries: Object.values(totals) })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      status = result.accepted === false ? "paused" : "connected";
    } catch {
      status = "disconnected";
    }
    notifyStatus();
  }

  async function reconcile(shouldUpload = true) {
    const at = now();
    settle(at);
    currentState = settings.websiteTrackingEnabled ? await activeTabState() : stateForTab(null);
    activeSince = at;
    await persist(at);
    if (shouldUpload) await upload();
  }

  async function saveSettings(next) {
    settle();
    settings = {
      ...settings,
      websiteTrackingEnabled: next.websiteTrackingEnabled === true,
      apiBaseUrl: normalizeApiBaseUrl(next.apiBaseUrl),
      dsnKey: String(next.dsnKey ?? "").trim()
    };
    await api.storage.local.set(settings);
    await reconcile();
    return getStatus();
  }

  async function initialize() {
    const stored = await api.storage.local.get({ ...DEFAULT_SETTINGS, totals: {}, trackingState: null });
    settings = { ...DEFAULT_SETTINGS, ...stored };
    if (!settings.installationId) {
      settings.installationId = crypto.randomUUID();
      await api.storage.local.set({ installationId: settings.installationId });
    }
    totals = stored.totals ?? {};
    if (stored.trackingState) {
      currentState = {
        hostname: stored.trackingState.hostname ?? null,
        url: stored.trackingState.url ?? null
      };
      activeSince = Number(stored.trackingState.activeSince) || now();
    }
    await api.alarms.create(UPLOAD_ALARM, { periodInMinutes: UPLOAD_PERIOD_MINUTES });
    await reconcile();
  }

  api.tabs.onActivated.addListener(() => run(() => reconcile(false)));
  api.tabs.onUpdated.addListener(() => run(() => reconcile(false)));
  api.windows.onFocusChanged.addListener(() => run(() => reconcile(false)));
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPLOAD_ALARM) run(reconcile);
  });
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "getStatus") {
      sendResponse(getStatus());
      return false;
    }
    if (message?.type === "getUsage") {
      ready.then(() => sendResponse(Object.values(totals))).catch(() => sendResponse([]));
      return true;
    }
    if (message?.type === "saveSettings") {
      run(() => saveSettings(message.settings)).then(sendResponse);
      return true;
    }
    return false;
  });

  const ready = run(initialize);
  return { ready, getStatus, reconcile: () => run(reconcile), upload: () => run(upload), saveSettings: (next) => run(() => saveSettings(next)), getTotals: () => totals };
}

if (typeof chrome !== "undefined") createController(chrome);
