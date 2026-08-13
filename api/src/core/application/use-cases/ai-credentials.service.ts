import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOKENS } from '@core/application/constants/tokens';
import { AiCredentialStatus } from '@core/domain/enums';
import {
  EntityNotFoundException,
  GeminiNotConfiguredException,
  InvalidAiCredentialException,
} from '@core/domain/exceptions';
import type { IAiCredentialCrypto, IGeminiKeyValidator } from '@core/application/ports/out/services.port';
import type {
  AiCredentialRecord,
  IAiCredentialRepository,
} from '@core/application/ports/out/ai-credential-repository.port';
import { classifyGeminiError, errorText } from '@core/application/gemini-errors';

export interface AiCredentialView {
  id: string;
  keyHint: string;
  enabled: boolean;
  status: AiCredentialStatus;
  lastError: string | null;
  lastUsedAt: Date | null;
  cooldownUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  usable: boolean;
}

const MAX_CREDENTIALS_PER_USER = 5;

@Injectable()
export class AiCredentialsService {
  constructor(
    @Inject(TOKENS.AI_CREDENTIAL_REPOSITORY) private readonly credentials: IAiCredentialRepository,
    @Inject(TOKENS.AI_CREDENTIAL_CRYPTO) private readonly crypto: IAiCredentialCrypto,
    @Inject(TOKENS.GEMINI_KEY_VALIDATOR) private readonly validator: IGeminiKeyValidator,
  ) {}

  async list(userId: string): Promise<AiCredentialView[]> {
    return (await this.credentials.list(userId)).map((credential) => this.view(credential));
  }

  async add(userId: string, apiKey: string): Promise<AiCredentialView> {
    const normalized = this.normalize(apiKey);
    if ((await this.credentials.count(userId)) >= MAX_CREDENTIALS_PER_USER) {
      throw new InvalidAiCredentialException('You can store up to 5 Gemini keys.');
    }
    await this.validate(normalized);
    const credential = await this.credentials.create({
      id: randomUUID(),
      userId,
      encryptedApiKey: this.crypto.encrypt(normalized),
      keyHint: this.crypto.keyHint(normalized),
    });
    return this.view(credential);
  }

  async update(userId: string, id: string, patch: { apiKey?: string; enabled?: boolean }): Promise<AiCredentialView> {
    const current = await this.find(userId, id);
    if (patch.apiKey !== undefined) {
      const normalized = this.normalize(patch.apiKey);
      await this.validate(normalized);
      const updated = await this.credentials.update(userId, id, {
        encryptedApiKey: this.crypto.encrypt(normalized),
        keyHint: this.crypto.keyHint(normalized),
        status: AiCredentialStatus.HEALTHY,
        lastError: null,
        cooldownUntil: null,
      });
      return this.view(updated ?? current);
    }
    if (patch.enabled === undefined) return this.view(current);
    const updated = await this.credentials.update(userId, id, { enabled: patch.enabled });
    return this.view(updated ?? current);
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.credentials.remove(userId, id))) throw new EntityNotFoundException('AiCredential', id);
  }

  async test(userId: string, id: string): Promise<AiCredentialView> {
    const current = await this.find(userId, id);
    try {
      await this.validator.validate(this.crypto.decrypt(current.encryptedApiKey));
      const updated = await this.credentials.update(userId, id, {
        status: AiCredentialStatus.HEALTHY,
        lastError: null,
        cooldownUntil: null,
      });
      return this.view(updated ?? current);
    } catch (error) {
      const classification = classifyGeminiError(error);
      const updated = await this.credentials.update(userId, id, {
        status: classification.status,
        lastError: errorText(error),
        cooldownUntil:
          classification.status === AiCredentialStatus.RATE_LIMITED
            ? new Date(Date.now() + (classification.retryAfterMs ?? 60_000))
            : null,
      });
      return this.view(updated ?? current);
    }
  }

  async assertUsable(userId: string): Promise<void> {
    if ((await this.credentials.listEligible(userId, new Date())).length === 0) {
      throw new GeminiNotConfiguredException();
    }
  }

  private async find(userId: string, id: string): Promise<AiCredentialRecord> {
    const credential = await this.credentials.findById(userId, id);
    if (!credential) throw new EntityNotFoundException('AiCredential', id);
    return credential;
  }

  private async validate(apiKey: string): Promise<void> {
    try {
      await this.validator.validate(apiKey);
    } catch (error) {
      throw new InvalidAiCredentialException(`Gemini rejected this key: ${errorText(error)}`);
    }
  }

  private normalize(apiKey: string): string {
    const normalized = apiKey.trim();
    if (!normalized) throw new InvalidAiCredentialException('A Gemini key is required.');
    return normalized;
  }

  private view(credential: AiCredentialRecord): AiCredentialView {
    const now = Date.now();
    const usable =
      credential.enabled &&
      (credential.status === AiCredentialStatus.HEALTHY ||
        (credential.status === AiCredentialStatus.RATE_LIMITED &&
          credential.cooldownUntil !== null &&
          credential.cooldownUntil.getTime() <= now));
    const { encryptedApiKey: _encryptedApiKey, ...safe } = credential;
    return { ...safe, usable };
  }
}
