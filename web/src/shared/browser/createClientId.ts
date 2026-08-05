export function createClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
