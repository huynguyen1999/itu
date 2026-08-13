import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIG_KEYS } from '@core/application/constants/app.constants';
import type { IAiCredentialCrypto } from '@core/application/ports/out/services.port';

@Injectable()
export class AiCredentialCrypto implements IAiCredentialCrypto {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(value: string): string {
    try {
      const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
      if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted Gemini credential');
      const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Stored Gemini credential could not be decrypted');
    }
  }

  keyHint(value: string): string {
    const normalized = value.trim();
    return `••••${normalized.slice(-4)}`;
  }

  private key(): Buffer {
    const secret = this.config.get<string>(CONFIG_KEYS.aiCredentialEncryptionKey)?.trim();
    if (!secret) throw new Error('AI_CREDENTIAL_ENCRYPTION_KEY is required');
    return createHash('sha256').update(secret).digest();
  }
}
