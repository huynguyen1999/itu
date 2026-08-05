import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_CONSTANTS, CONFIG_KEYS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { IAiProvider } from '@core/application/ports/out/services.port';
import { GeminiAiProvider } from './gemini-ai.provider';
import { OpenRouterAiProvider } from './openrouter-ai.provider';

@Module({
  providers: [
    GeminiAiProvider,
    OpenRouterAiProvider,
    {
      provide: TOKENS.AI_PROVIDER,
      inject: [ConfigService, GeminiAiProvider, OpenRouterAiProvider],
      useFactory: (config: ConfigService, gemini: GeminiAiProvider, openRouter: OpenRouterAiProvider): IAiProvider =>
        selectAiProvider(config.get<string>(CONFIG_KEYS.aiProvider, AI_CONSTANTS.defaultProvider), gemini, openRouter),
    },
  ],
  exports: [TOKENS.AI_PROVIDER],
})
export class AiProviderModule {}

export function selectAiProvider(
  provider: string | undefined,
  gemini: GeminiAiProvider,
  openRouter: OpenRouterAiProvider,
): IAiProvider {
  const normalized = provider?.trim().toLowerCase() || AI_CONSTANTS.defaultProvider;
  if (normalized === 'openrouter') return openRouter;
  if (normalized === 'gemini') return gemini;
  throw new Error(`Unsupported AI_PROVIDER "${provider}". Use "openrouter" or "gemini".`);
}
