export interface ApiClientContext {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  stream(path: string, init?: RequestInit): Promise<ReadableStream<Uint8Array>>;
  offlineMutation<T>(input: OfflineMutationInput<T>, fallback: () => Promise<T>): Promise<T>;
}

export interface OfflineMutationInput<T> {
  kind: string;
  entityId: string;
  payload: Record<string, unknown>;
  baseVersion?: number;
  baseValues?: Record<string, unknown>;
  immediate?: boolean;
  optimistic: T;
}

export type OfflineMutationHandler = <T>(input: OfflineMutationInput<T>) => Promise<T>;
