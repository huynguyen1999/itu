import { stateForTab } from "./activity.js";

export const CHROMIUM_IDENTITY = {
  bundleId: "com.microsoft.edgemac",
  displayName: "Microsoft Edge"
};

export function createChromiumAdapter(api, identity = CHROMIUM_IDENTITY) {
  return {
    identity,
    localStore: {
      get: (defaults) => api.storage.local.get(defaults),
      set: (changes) => api.storage.local.set(changes),
      remove: async (keys) => {
        if (api.storage.local.remove) return api.storage.local.remove(keys);
        if (api.state) for (const key of keys) delete api.state[key];
      }
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
      return api.alarms.create(name, { periodInMinutes });
    },
    notifyStatus(status) {
      return api.runtime.sendMessage({ type: "status", status });
    },
    subscribeToActivity(handler) {
      api.tabs.onActivated.addListener(handler);
      api.tabs.onUpdated.addListener(handler);
      api.windows.onFocusChanged.addListener(handler);
    },
    subscribeToOnline(handler) {
      globalThis.addEventListener?.("online", handler);
    },
    subscribeToUpload(handler) {
      api.alarms.onAlarm.addListener((alarm) => handler(alarm.name));
    },
    subscribeToMessages(handler) {
      api.runtime.onMessage.addListener(handler);
    },
    isOnline() {
      return globalThis.navigator?.onLine !== false;
    }
  };
}
