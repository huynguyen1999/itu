function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return getLocalStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      getLocalStorage()?.setItem(key, value);
    } catch {
      // Storage may be disabled, partitioned, or full. Keep the app usable in memory.
    }
  },

  removeItem(key: string): void {
    try {
      getLocalStorage()?.removeItem(key);
    } catch {
      // A failed cleanup must not prevent logout or authentication recovery.
    }
  },
};
