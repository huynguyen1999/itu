import { AiCredentialStatus } from '@core/domain/enums';

export interface AiCredentialRecord {
  id: string;
  userId: string;
  encryptedApiKey: string;
  keyHint: string;
  enabled: boolean;
  status: AiCredentialStatus;
  lastError: string | null;
  lastUsedAt: Date | null;
  cooldownUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAiCredentialData {
  id: string;
  userId: string;
  encryptedApiKey: string;
  keyHint: string;
}

export interface UpdateAiCredentialData {
  encryptedApiKey?: string;
  keyHint?: string;
  enabled?: boolean;
  status?: AiCredentialStatus;
  lastError?: string | null;
  lastUsedAt?: Date | null;
  cooldownUntil?: Date | null;
}

export interface IAiCredentialRepository {
  list(userId: string): Promise<AiCredentialRecord[]>;
  listEligible(userId: string, now: Date): Promise<AiCredentialRecord[]>;
  count(userId: string): Promise<number>;
  findById(userId: string, id: string): Promise<AiCredentialRecord | null>;
  create(data: CreateAiCredentialData): Promise<AiCredentialRecord>;
  update(userId: string, id: string, data: UpdateAiCredentialData): Promise<AiCredentialRecord | null>;
  remove(userId: string, id: string): Promise<boolean>;
}
