import type { ApiClientContext } from './apiContext';

export type AiCredentialStatus = 'HEALTHY' | 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'INVALID_KEY' | 'PROVIDER_ERROR';

export interface AiCredential {
  id: string;
  keyHint: string;
  enabled: boolean;
  status: AiCredentialStatus;
  lastError: string | null;
  lastUsedAt: string | null;
  cooldownUntil: string | null;
  createdAt: string;
  updatedAt: string;
  usable: boolean;
}

export interface AiCredentialsApi {
  listAiCredentials(): Promise<AiCredential[]>;
  addAiCredential(apiKey: string): Promise<AiCredential>;
  updateAiCredential(id: string, patch: { apiKey?: string; enabled?: boolean }): Promise<AiCredential>;
  removeAiCredential(id: string): Promise<{ success: boolean }>;
  testAiCredential(id: string): Promise<AiCredential>;
}

export function createAiCredentialsApi(context: ApiClientContext): AiCredentialsApi {
  return {
    listAiCredentials: () => context.request<AiCredential[]>('/ai/credentials'),
    addAiCredential: (apiKey) =>
      context.request<AiCredential>('/ai/credentials', { method: 'POST', body: JSON.stringify({ apiKey }) }),
    updateAiCredential: (id, patch) =>
      context.request<AiCredential>(`/ai/credentials/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    removeAiCredential: (id) => context.request<{ success: boolean }>(`/ai/credentials/${id}`, { method: 'DELETE' }),
    testAiCredential: (id) => context.request<AiCredential>(`/ai/credentials/${id}/test`, { method: 'POST' }),
  };
}
