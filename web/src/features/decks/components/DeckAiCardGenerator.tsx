import { useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bot, Settings2 } from 'lucide-react';
import type { AiSuggestedCard } from '@/shared/api/client';
import { api } from '@/shared/api/client';
import { parseSseEventLine } from '@/shared/utils/sse';
import { MarkdownPreview } from '@/shared/markdown/MarkdownPreview';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

export function DeckAiCardGenerator({ deckId, canUseAi }: { deckId: string; canUseAi: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [aiText, setAiText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamErrorCode, setStreamErrorCode] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestedCard[]>([]);
  const [addedSuggestions, setAddedSuggestions] = useState<number[]>([]);

  const aiCredentialsQuery = useQuery({
    queryKey: ['ai-credentials'],
    queryFn: () => api.listAiCredentials(),
    enabled: canUseAi,
  });
  const hasUsableAiCredentials = aiCredentialsQuery.data?.some((credential) => credential.usable) ?? false;

  const suggest = useMutation({
    mutationFn: async () => {
      setIsStreaming(true);
      setStreamError(null);
      setStreamErrorCode(null);
      setSuggestions([]);
      setAddedSuggestions([]);

      try {
        const stream = await api.suggestCardsStream(aiText);
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const parsedLine = parseSseEventLine<{ chunk?: string; error?: string }>(event);
            if (!parsedLine.isData || !parsedLine.data) continue;
            if (parsedLine.error) {
              throw new AiStreamError(parsedLine.error, parsedLine.code ?? undefined);
            }
            if (parsedLine.data.chunk) {
              accumulatedText += parsedLine.data.chunk;
              const parsedCards = parsePartialCards(accumulatedText);
              if (parsedCards.length > 0) {
                setSuggestions(parsedCards);
              }
            }
          }
        }

        if (buffer.trim()) {
          const parsedLine = parseSseEventLine<{ chunk?: string }>(buffer);
          if (parsedLine.isData && parsedLine.data?.chunk) {
            accumulatedText += parsedLine.data.chunk;
          }
        }
        const finalCards = parsePartialCards(accumulatedText);
        if (finalCards.length > 0) {
          setSuggestions(finalCards);
        } else {
          try {
            const parsed = JSON.parse(accumulatedText);
            const cards = Array.isArray(parsed) ? parsed : parsed.cards || [];
            if (cards.length > 0) setSuggestions(cards);
          } catch {}
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStreamError(message);
        setStreamErrorCode(err instanceof AiStreamError ? (err.code ?? null) : errorCode(err));
        throw err;
      } finally {
        setIsStreaming(false);
      }
    },
  });

  const saveSuggestion = useMutation({
    mutationFn: ({ suggestion }: { index: number; suggestion: AiSuggestedCard }) =>
      api.createCard(deckId, {
        type: 'BASIC',
        promptRichText: suggestion.promptRichText,
        answerRichText: suggestion.answerRichText,
        tags: suggestion.tags,
      }),
    onSuccess: (_card, variables) => {
      setAddedSuggestions((items) => Array.from(new Set([...items, variables.index])));
      void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    },
  });

  const saveAllSuggestions = useMutation({
    mutationFn: async (items: Array<{ index: number; suggestion: AiSuggestedCard }>) => {
      for (const item of items) {
        await api.createCard(deckId, {
          type: 'BASIC',
          promptRichText: item.suggestion.promptRichText,
          answerRichText: item.suggestion.answerRichText,
          tags: item.suggestion.tags,
        });
      }
      return items.map((item) => item.index);
    },
    onSuccess: (indexes) => {
      setAddedSuggestions((items) => Array.from(new Set([...items, ...indexes])));
      void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    },
  });

  const pendingAiJob = isStreaming || suggest.isPending;
  const remainingSuggestions = suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .filter((item) => !addedSuggestions.includes(item.index));

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardHeader>
        <CardTitle className="text-primary flex items-center gap-2">
          <Bot className="h-5 w-5" /> Generate with AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiCredentialsQuery.isSuccess && !hasUsableAiCredentials ? (
          <div className="space-y-3 rounded-xl border border-dashed p-4">
            <p className="text-sm text-muted-foreground">Configure Gemini in Settings to use AI</p>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/settings?section=ai')}>
              <Settings2 /> Open Settings → AI
            </Button>
          </div>
        ) : (
          <>
            <Textarea
              value={aiText}
              onChange={(event) => setAiText(event.target.value)}
              placeholder="Paste your notes here to automatically generate flashcards..."
              className="min-h-[100px] bg-background"
              disabled={aiCredentialsQuery.isLoading}
            />
            <Button
              variant="secondary"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={suggest.isPending || pendingAiJob || !aiText.trim() || !hasUsableAiCredentials}
              onClick={() => suggest.mutate()}
            >
              <Bot size={16} /> {suggest.isPending || pendingAiJob ? 'Generating...' : 'Generate suggestions'}
            </Button>
          </>
        )}
        {(suggest.isError || streamError) && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              {streamError || (suggest.error instanceof Error ? suggest.error.message : 'Request failed')}
            </p>
            {streamErrorCode === 'GEMINI_NOT_CONFIGURED' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => navigate('/settings?section=ai')}>
                <Settings2 /> Open Settings → AI
              </Button>
            ) : null}
          </div>
        )}
        {(pendingAiJob || suggestions.length > 0) && (
          <div className="rounded-md border bg-card p-4 text-sm">
            {pendingAiJob && suggestions.length === 0 && (
              <p className="text-muted-foreground flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Generating suggestions in real-time...
              </p>
            )}
            {suggestions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">Suggested cards</p>
                    <p className="text-xs text-muted-foreground">
                      {addedSuggestions.length} of {suggestions.length} added
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saveAllSuggestions.isPending || remainingSuggestions.length === 0}
                    onClick={() => saveAllSuggestions.mutate(remainingSuggestions)}
                  >
                    {saveAllSuggestions.isPending ? 'Adding...' : 'Add all'}
                  </Button>
                </div>

                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => {
                    const added = addedSuggestions.includes(index);
                    return (
                      <div key={index} className="space-y-4 rounded-md border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Suggestion {index + 1}
                          </p>
                          <Button
                            size="sm"
                            disabled={
                              added ||
                              saveSuggestion.isPending ||
                              !suggestion.promptRichText.trim() ||
                              !suggestion.answerRichText.trim()
                            }
                            onClick={() => saveSuggestion.mutate({ index, suggestion })}
                          >
                            {added ? 'Added' : 'Add card'}
                          </Button>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`ai-prompt-${index}`}>Prompt</Label>
                            <Textarea
                              id={`ai-prompt-${index}`}
                              value={suggestion.promptRichText}
                              disabled={added}
                              className="min-h-[90px] bg-background"
                              onChange={(event) =>
                                updateSuggestion(index, { promptRichText: event.target.value }, setSuggestions)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`ai-answer-${index}`}>Answer</Label>
                            <Textarea
                              id={`ai-answer-${index}`}
                              value={suggestion.answerRichText}
                              disabled={added}
                              className="min-h-[90px] bg-background"
                              onChange={(event) =>
                                updateSuggestion(index, { answerRichText: event.target.value }, setSuggestions)
                              }
                            />
                          </div>
                        </div>

                        <div className="rounded-md bg-card p-3">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Preview
                          </p>
                          <div className="grid gap-4 xl:grid-cols-2">
                            <MarkdownPreview
                              value={suggestion.promptRichText}
                              className="border-l-2 border-primary/30 pl-3 text-sm"
                            />
                            <MarkdownPreview
                              value={suggestion.answerRichText}
                              className="border-l-2 border-border pl-3 text-sm text-muted-foreground"
                            />
                          </div>
                        </div>

                        {suggestion.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {suggestion.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

class AiStreamError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

function updateSuggestion(
  index: number,
  patch: Partial<AiSuggestedCard>,
  setSuggestions: Dispatch<SetStateAction<AiSuggestedCard[]>>,
) {
  setSuggestions((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function parsePartialCards(text: string): AiSuggestedCard[] {
  const cards: AiSuggestedCard[] = [];

  try {
    const cleanText = text
      .replace(/^```json\s*/i, '')
      .replace(/```$/, '')
      .trim();
    if (cleanText.startsWith('{') || cleanText.startsWith('[')) {
      const parsed = JSON.parse(cleanText);
      const list = Array.isArray(parsed) ? parsed : parsed.cards || [];
      for (const card of list) {
        if (card && typeof card.promptRichText === 'string' && typeof card.answerRichText === 'string') {
          cards.push({
            promptRichText: card.promptRichText,
            answerRichText: card.answerRichText,
            tags: Array.isArray(card.tags) ? card.tags : [],
          });
        }
      }
      if (cards.length > 0) return cards;
    }
  } catch {
    // If JSON parsing fails, fall back to plain text parsing
  }

  const blocks = text.split(/(?:^|\n)(?:---|\*\*\*|=== CARD ===|Card \d+:)\s*\n?/i);

  for (const block of blocks) {
    const lines = block.split('\n');
    let promptRichText = '';
    let answerRichText = '';
    let tags: string[] = [];

    let currentField: 'prompt' | 'answer' | 'tags' | null = null;

    for (const line of lines) {
      const frontMatch = line.match(/^(?:Front|Question|Q|Prompt)\s*:\s*(.*)/i);
      const backMatch = line.match(/^(?:Back|Answer|A)\s*:\s*(.*)/i);
      const tagsMatch = line.match(/^(?:Tags|Tag)\s*:\s*(.*)/i);

      if (frontMatch) {
        currentField = 'prompt';
        promptRichText = (promptRichText ? promptRichText + '\n' : '') + frontMatch[1];
      } else if (backMatch) {
        currentField = 'answer';
        answerRichText = (answerRichText ? answerRichText + '\n' : '') + backMatch[1];
      } else if (tagsMatch) {
        currentField = 'tags';
        const tagsString = tagsMatch[1];
        tags = tagsString
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      } else if (currentField === 'prompt') {
        promptRichText = (promptRichText ? promptRichText + '\n' : '') + line;
      } else if (currentField === 'answer') {
        answerRichText = (answerRichText ? answerRichText + '\n' : '') + line;
      }
    }

    const cleanPrompt = promptRichText.trim();
    const cleanAnswer = answerRichText.trim();

    if (cleanPrompt || cleanAnswer) {
      cards.push({ promptRichText: cleanPrompt, answerRichText: cleanAnswer, tags });
    }
  }

  return cards;
}
