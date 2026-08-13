import { Module } from '@nestjs/common';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TOKENS } from '@core/application/constants/tokens';
import { GeminiAiProvider } from './gemini-ai.provider';
import { AiCredentialCrypto } from './ai-credential.crypto';
import { GeminiKeyValidator } from './gemini-key.validator';

@Module({
  imports: [PersistenceModule],
  providers: [
    GeminiAiProvider,
    AiCredentialCrypto,
    GeminiKeyValidator,
    { provide: TOKENS.AI_PROVIDER, useExisting: GeminiAiProvider },
    { provide: TOKENS.AI_CREDENTIAL_CRYPTO, useExisting: AiCredentialCrypto },
    { provide: TOKENS.GEMINI_KEY_VALIDATOR, useExisting: GeminiKeyValidator },
  ],
  exports: [TOKENS.AI_PROVIDER, TOKENS.AI_CREDENTIAL_CRYPTO, TOKENS.GEMINI_KEY_VALIDATOR],
})
export class AiProviderModule {}
