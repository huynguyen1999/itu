import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIG_KEYS } from '@core/application/constants/app.constants';
import type { IAiCredentialCrypto } from '@core/application/ports/out/services.port';
import { decryptAesGcm, encryptAesGcm } from '../security/aes-gcm';

@Injectable()
export class AiCredentialCrypto implements IAiCredentialCrypto {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    return encryptAesGcm(value, this.secret());
  }

  decrypt(value: string): string {
    try {
      return decryptAesGcm(value, this.secret());
    } catch {
      throw new Error('Stored Gemini credential could not be decrypted');
    }
  }

  keyHint(value: string): string {
    const normalized = value.trim();
    return `••••${normalized.slice(-4)}`;
  }

  private secret(): string {
    const secret = this.config.get<string>(CONFIG_KEYS.aiCredentialEncryptionKey)?.trim();
    if (!secret) throw new Error('AI_CREDENTIAL_ENCRYPTION_KEY is required');
    return secret;
  }
}
