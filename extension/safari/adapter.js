import { stateForTab } from "./activity.js";

export const SAFARI_IDENTITY = {
  bundleId: "com.apple.mobilesafari",
  displayName: "Safari"
};

const NATIVE_HOST = "com.itu.ios";
const NATIVE_FIELDS = [
  "apiBaseUrl", "dsnKey", "accountId", "uploadEnabled",
  "trackingEnabled", "websiteTrackingEnabled", "privateTrackingEnabled", "installationId"
];

function nativeSettings(value) {
  const settings = value?.settings ?? value ?? {};
  return settings.websiteTrackingEnabled === undefined && settings.trackingEnabled !== undefined
    ? { ...settings, websiteTrackingEnabled: settings.trackingEnabled }
    : settings;
}

export function createSafariAdapter(api = globalThis.browser ?? globalThis.chrome, options = {}) {
  const nativeHost = options.nativeHost ?? NATIVE_HOST;
  return {
    identity: SAFARI_IDENTITY,
    settingsDefaults: { privateTrackingEnabled: false },
    localStore: {
      get: (defaults) => api.storage.local.get(defaults),
      set: (changes) => api.storage.local.set(changes),
      remove: async (keys) => {
        if (api.storage.local.remove) return api.storage.local.remove(keys);
        if (api.state) for (const key of keys) delete api.state[key];
      }
    },
    sendNativeMessage(message) {
      return api.runtime?.sendNativeMessage?.(nativeHost, message);
    },
    async loadSettings() {
      try {
        if (api.runtime?.sendNativeMessage) {
          const result = await api.runtime.sendNativeMessage(nativeHost, { type: "getConfiguration" });
          if (result != null) return nativeSettings(result);
        }
      } catch {
        // Fall back to WebExtension storage when the native app is unavailable.
      }
      const stored = await api.storage.local.get(NATIVE_FIELDS);
      return nativeSettings(Object.fromEntries(NATIVE_FIELDS.filter((key) => stored[key] !== undefined).map((key) => [key, stored[key]])));
    },
    async getActiveState() {
      try {
        const focused = await api.windows.getLastFocused({ populate: true });
        if (focused?.focused === false) return stateForTab(null);
        return stateForTab(focused?.tabs?.find((tab) => tab.active));
      } catch {
        return stateForTab(null);
      }
    },
    scheduleUpload(name, periodInMinutes) {
      return api.alarms?.create?.(name, { periodInMinutes });
    },
    notifyStatus(status) {
      return api.runtime?.sendMessage?.({ type: "status", status });
    },
    subscribeToActivity(handler) {
      api.tabs?.onActivated?.addListener(handler);
      api.tabs?.onUpdated?.addListener(handler);
      api.windows?.onFocusChanged?.addListener(handler);
    },
    subscribeToOnline(handler) {
      globalThis.addEventListener?.("online", handler);
    },
    subscribeToWake(handler) {
      api.runtime?.onStartup?.addListener(handler);
      api.runtime?.onMessage?.addListener((message) => {
        if (message?.type === "wake") handler();
      });
    },
    subscribeToUpload(handler) {
      api.alarms?.onAlarm?.addListener((alarm) => handler(alarm.name));
    },
    subscribeToMessages(handler) {
      api.runtime?.onMessage?.addListener(handler);
    },
    isOnline() {
      return globalThis.navigator?.onLine !== false;
    }
  };
}
