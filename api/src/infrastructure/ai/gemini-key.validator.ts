import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AI_CONSTANTS, CONFIG_KEYS } from '@core/application/constants/app.constants';
import type { IGeminiKeyValidator } from '@core/application/ports/out/services.port';

@Injectable()
export class GeminiKeyValidator implements IGeminiKeyValidator {
  constructor(private readonly config: ConfigService) {}

  async validate(apiKey: string): Promise<void> {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: this.config.get<string>(CONFIG_KEYS.geminiModel, AI_CONSTANTS.defaultGeminiModel),
      contents: 'Reply with OK.',
      config: { maxOutputTokens: 1 },
    });
  }
}
