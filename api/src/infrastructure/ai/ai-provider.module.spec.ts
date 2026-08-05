import type { IAiProvider } from '@core/application/ports/out/services.port';
import { selectAiProvider } from './ai-provider.module';
import type { GeminiAiProvider } from './gemini-ai.provider';
import type { OpenRouterAiProvider } from './openrouter-ai.provider';

describe('selectAiProvider', () => {
  const gemini = { generateCards: jest.fn(), reviewSession: jest.fn() } as unknown as GeminiAiProvider;
  const openRouter = { generateCards: jest.fn(), reviewSession: jest.fn() } as unknown as OpenRouterAiProvider;

  it('selects OpenRouter by default and when explicitly configured', () => {
    expect(selectAiProvider(undefined, gemini, openRouter)).toBe(openRouter as unknown as IAiProvider);
    expect(selectAiProvider('openrouter', gemini, openRouter)).toBe(openRouter as unknown as IAiProvider);
  });

  it('selects Gemini when explicitly configured', () => {
    expect(selectAiProvider('gemini', gemini, openRouter)).toBe(gemini as unknown as IAiProvider);
  });

  it('fails startup for unsupported provider names', () => {
    expect(() => selectAiProvider('unknown', gemini, openRouter)).toThrow(
      'Unsupported AI_PROVIDER "unknown". Use "openrouter" or "gemini".',
    );
  });
});
