export function createClientId(): string {
  return crypto.randomUUID();
}
