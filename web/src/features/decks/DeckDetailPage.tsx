import { FormEvent, useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Bot,
  CheckSquare2,
  FolderInput,
  MoreHorizontal,
  Play,
  ArrowLeft,
  Pencil,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type { AiSuggestedCard, Card as APICard, DeckColor, DeckIcon, DeckListItem } from '@/shared/api/client';
import { MarkdownCardEditor } from '@/shared/editor/MarkdownCardEditor';
import { MarkdownPreview } from '@/shared/markdown/MarkdownPreview';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/ui/card';
import { CardImporterModal } from './components/CardImporterModal';
import { DeckCardItem } from './components/DeckCardItem';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Skeleton } from '@/shared/ui/skeleton';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useAuth } from '@/shared/auth/AuthProvider';
import { DeckStylePicker, getDeckStyle } from './utils/deckStyles';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';

type PendingCardImage = {
  side: 'PROMPT' | 'ANSWER';
  file: File;
  markdownUrl: string;
};

export function DeckDetailPage() {
  const permissions = useAuth().user?.permissions ?? [];
  const canImport = permissions.includes('CARD_IMPORT');
  const canUseAi = permissions.includes('AI_USE');
  const { deckId = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isReverse, setIsReverse] = useState(false);
  const [promptRichText, setPrompt] = useState('');
  const [answerRichText, setAnswer] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingCardImage[]>([]);
  const [aiText, setAiText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestedCard[]>([]);
  const [addedSuggestions, setAddedSuggestions] = useState<number[]>([]);
  const [isEditingDeck, setIsEditingDeck] = useState(false);
  const [isDeleteDeckDialogOpen, setIsDeleteDeckDialogOpen] = useState(false);
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [deckIcon, setDeckIcon] = useState<DeckIcon>('BOOK');
  const [deckColor, setDeckColor] = useState<DeckColor>('TEAL');
  const [activeTab, setActiveTab] = useState<'cards' | 'add' | 'insights'>('cards');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [moveCardIds, setMoveCardIds] = useState<string[]>([]);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [moveSearch, setMoveSearch] = useState('');
  const [undoMove, setUndoMove] = useState<{ cardIds: string[]; sourceDeckId: string } | null>(null);
  const [cardSearchInput, setCardSearchInput] = useState('');
  const [submittedCardSearch, setSubmittedCardSearch] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const deckQuery = useQuery({ queryKey: ['deck', deckId], queryFn: () => api.deck(deckId), enabled: Boolean(deckId) });
  const statsQuery = useQuery({
    queryKey: ['deck-stats', deckId],
    queryFn: () => api.deckStats(deckId),
    enabled: Boolean(deckId),
  });
  const deck = deckQuery.data;
  const deckOptionsQuery = useInfiniteQuery({
    queryKey: ['decks', 'move-options'],
    queryFn: ({ pageParam }) => api.decks({ cursor: pageParam, limit: 50 }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });
  const deckOptions = (deckOptionsQuery.data?.pages.flatMap((page) => page.data) ?? []).filter(
    (option) => typeof option.title === 'string',
  );
  const cards = useInfiniteQuery({
    queryKey: ['cards', deckId, submittedCardSearch],
    queryFn: ({ pageParam }) => api.cards(deckId, { cursor: pageParam, q: submittedCardSearch }),
    enabled: Boolean(deckId),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });
  const cardItems = cards.data?.pages.flatMap((page) => page.data) ?? [];
  const hasPromptContent = promptRichText.trim().length > 0 || pendingImages.some((image) => image.side === 'PROMPT');
  const hasAnswerContent = answerRichText.trim().length > 0 || pendingImages.some((image) => image.side === 'ANSWER');

  useEffect(() => {
    if (!deck || isEditingDeck) return;
    setDeckTitle(deck.title);
    setDeckDescription(deck.description ?? '');
    setDeckIcon(deck.icon);
    setDeckColor(deck.color);
  }, [deck, isEditingDeck]);

  const createCard = useMutation({
    mutationFn: async () => {
      const type = isReverse ? 'REVERSE' : 'BASIC';
      const card = (await api.createCard(deckId, { type, promptRichText, answerRichText, tags: [] })) as APICard;
      const replacements = new Map<string, string>();

      for (const image of pendingImages) {
        const uploaded = await api.uploadCardImage(card.id, image.side, image.file);
        replacements.set(image.markdownUrl, uploaded.url);
      }

      if (replacements.size === 0) return card;

      return api.updateCard(deckId, card.id, {
        promptRichText: replaceMarkdownImageUrls(promptRichText, replacements),
        answerRichText: replaceMarkdownImageUrls(answerRichText, replacements),
      });
    },
    onSuccess: () => {
      pendingImages.forEach((image) => URL.revokeObjectURL(image.markdownUrl));
      setPrompt('');
      setAnswer('');
      setPendingImages([]);
      void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    },
  });

  const updateDeck = useMutation({
    mutationFn: () =>
      api.updateDeck(deckId, {
        title: deckTitle.trim(),
        description: deckDescription.trim() || null,
        icon: deckIcon,
        color: deckColor,
      }),
    onSuccess: () => {
      setIsEditingDeck(false);
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      void queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
    },
  });

  const moveCards = useMutation({
    mutationFn: ({ cardIds, targetDeckId }: { cardIds: string[]; targetDeckId: string }) =>
      api.moveCards(cardIds, targetDeckId),
    onSuccess: (_result, variables) => {
      setIsMoveDialogOpen(false);
      setMoveCardIds([]);
      setSelectedCardIds(new Set());
      setSelectionMode(false);
      setUndoMove(variables.targetDeckId === deckId ? null : { cardIds: variables.cardIds, sourceDeckId: deckId });
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      void queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['due'] });
    },
  });

  const deleteDeck = useMutation({
    mutationFn: () => api.deleteDeck(deckId),
    onSuccess: () => {
      setIsDeleteDeckDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      navigate('/learn/decks');
    },
  });

  const suggest = useMutation({
    mutationFn: async () => {
      setIsStreaming(true);
      setStreamError(null);
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
            const line = event.trim();
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                const chunk = parsed.chunk;
                if (chunk) {
                  accumulatedText += chunk;

                  const parsedCards = parsePartialCards(accumulatedText);
                  if (parsedCards.length > 0) {
                    setSuggestions(parsedCards);
                  }
                }
              } catch (e) {
                if (line.includes('event: error')) {
                  throw e;
                }
              }
            }
          }
        }

        if (buffer.trim()) {
          const line = buffer.trim();
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.chunk) {
                accumulatedText += parsed.chunk;
              }
            } catch {}
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
        const msg = err instanceof Error ? err.message : String(err);
        setStreamError(msg);
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

  function submit(event: FormEvent) {
    event.preventDefault();
    createCard.mutate();
  }

  function addPendingImage(side: 'PROMPT' | 'ANSWER', file: File): string {
    const markdownUrl = URL.createObjectURL(file);
    setPendingImages((items) => [...items, { side, file, markdownUrl }]);
    return markdownUrl;
  }

  function removePendingImage(side: 'PROMPT' | 'ANSWER', sideIndex: number) {
    setPendingImages((items) => {
      let seenForSide = 0;
      const itemIndex = items.findIndex((image) => {
        if (image.side !== side) return false;
        const isTarget = seenForSide === sideIndex;
        seenForSide += 1;
        return isTarget;
      });
      const removedImage = itemIndex >= 0 ? items[itemIndex] : null;

      if (removedImage) {
        URL.revokeObjectURL(removedImage.markdownUrl);
        const removeUrl = (value: string) => removeMarkdownImageUrl(value, removedImage.markdownUrl);
        if (side === 'PROMPT') {
          setPrompt(removeUrl);
        } else {
          setAnswer(removeUrl);
        }
      }

      return itemIndex >= 0 ? items.filter((_, index) => index !== itemIndex) : items;
    });
  }

  function openMove(cardIds: string[]) {
    setMoveCardIds(cardIds);
    setMoveSearch('');
    setIsMoveDialogOpen(true);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-7 ${deck ? getDeckStyle(deck.icon, deck.color).color.softClass : 'bg-card'}`}
      >
        {deck && (
          <div className={`absolute inset-y-0 left-0 w-2 ${getDeckStyle(deck.icon, deck.color).color.railClass}`} />
        )}
        <div className="flex items-start gap-3 sm:gap-4">
          <Button variant="outline" size="icon" className="shrink-0 bg-background/80" asChild>
            <Link to="/learn/decks" aria-label="Back to decks">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            {isEditingDeck ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (deckTitle.trim()) updateDeck.mutate();
                }}
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <Input
                    value={deckTitle}
                    onChange={(event) => setDeckTitle(event.target.value)}
                    maxLength={120}
                    className="bg-background text-lg font-semibold"
                    placeholder="Deck title"
                  />
                  <Input
                    value={deckDescription}
                    onChange={(event) => setDeckDescription(event.target.value)}
                    maxLength={500}
                    className="bg-background"
                    placeholder="Description"
                  />
                </div>
                <DeckStylePicker
                  icon={deckIcon}
                  color={deckColor}
                  onIconChange={setDeckIcon}
                  onColorChange={setDeckColor}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={!deckTitle.trim() || updateDeck.isPending}>
                    {updateDeck.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDeckTitle(deck?.title ?? '');
                      setDeckDescription(deck?.description ?? '');
                      setDeckIcon(deck?.icon ?? 'BOOK');
                      setDeckColor(deck?.color ?? 'TEAL');
                      setIsEditingDeck(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {updateDeck.isError && <p className="text-sm text-destructive">{errorMessage(updateDeck.error)}</p>}
              </form>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  {deck &&
                    (() => {
                      const { Icon, color } = getDeckStyle(deck.icon, deck.color);
                      return (
                        <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${color.iconClass}`}
                        >
                          <Icon className="h-7 w-7" />
                        </div>
                      );
                    })()}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {deck?.title || 'Deck Details'}
                      </h1>
                      {deck?.isDefault && (
                        <span className="rounded-full bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          Default
                        </span>
                      )}
                    </div>
                    {deck?.description && <p className="text-muted-foreground mt-1">{deck.description}</p>}
                    {statsQuery.data && (
                      <p className="mt-2 text-sm font-medium text-muted-foreground">
                        {statsQuery.data.totalCards} cards ·{' '}
                        {statsQuery.data.upcomingReviewForecast.reduce((sum, item) => sum + item.dueCount, 0)} scheduled
                      </p>
                    )}
                  </div>
                </div>
                {deck && (
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
                    <Button className="flex-1 gap-2 sm:flex-none" asChild>
                      <Link to={`/learn/review?deckId=${deckId}`}>
                        <Play className="h-4 w-4" />
                        Start review
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="bg-background/80" aria-label="Deck actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setDeckTitle(deck.title);
                            setDeckDescription(deck.description ?? '');
                            setDeckIcon(deck.icon);
                            setDeckColor(deck.color);
                            setIsEditingDeck(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit deck
                        </DropdownMenuItem>
                        {canImport && (
                          <DropdownMenuItem onClick={() => setIsImportModalOpen(true)}>
                            <UploadCloud className="mr-2 h-4 w-4" />
                            Import cards
                          </DropdownMenuItem>
                        )}
                        {!deck.isDefault && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setIsDeleteDeckDialogOpen(true)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete deck
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ConfirmDialog
                      open={isDeleteDeckDialogOpen}
                      onOpenChange={setIsDeleteDeckDialogOpen}
                      title="Delete deck?"
                      description={`This will move "${deck.title}" to trash. Cards remain recoverable while the deck is in trash.`}
                      confirmLabel="Delete deck"
                      isPending={deleteDeck.isPending}
                      onConfirm={() => deleteDeck.mutate()}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border bg-muted/50 p-1" role="tablist" aria-label="Deck workspace">
        {(
          [
            ['cards', 'Cards'],
            ['add', 'Add cards'],
            ['insights', 'Insights'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={activeTab === value}
            onClick={() => setActiveTab(value)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'insights' && statsQuery.data && <DeckStatsPanel stats={statsQuery.data} />}

      <div className="items-start">
        {activeTab === 'add' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add new card</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-6" onSubmit={submit}>
                  <MarkdownCardEditor
                    label="Front side (Prompt)"
                    value={promptRichText}
                    onChange={setPrompt}
                    onImage={(file) => addPendingImage('PROMPT', file)}
                    pendingImages={pendingImages.filter((image) => image.side === 'PROMPT').map((image) => image.file)}
                    onRemovePendingImage={(index) => removePendingImage('PROMPT', index)}
                  />
                  <MarkdownCardEditor
                    label="Back side (Answer)"
                    value={answerRichText}
                    onChange={setAnswer}
                    onImage={(file) => addPendingImage('ANSWER', file)}
                    pendingImages={pendingImages.filter((image) => image.side === 'ANSWER').map((image) => image.file)}
                    onRemovePendingImage={(index) => removePendingImage('ANSWER', index)}
                  />

                  <div className="flex items-center space-x-2">
                    <Checkbox id="reverse" checked={isReverse} onCheckedChange={(c) => setIsReverse(!!c)} />
                    <Label htmlFor="reverse" className="text-sm font-medium leading-none cursor-pointer">
                      Also study in reverse (create a two-way card)
                    </Label>
                  </div>

                  <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                      {pendingImages.length > 0 && <span>{pendingImages.length} image(s) will upload after save.</span>}
                    </div>
                    <Button
                      type="submit"
                      className="w-full sm:w-auto"
                      disabled={createCard.isPending || !hasPromptContent || !hasAnswerContent}
                    >
                      {createCard.isPending ? 'Saving…' : 'Save card'}
                    </Button>
                  </div>
                  {createCard.isError && (
                    <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                      <AlertCircle className="h-4 w-4" /> {errorMessage(createCard.error)}
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>

            {canUseAi && (
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-primary flex items-center gap-2">
                    <Bot className="h-5 w-5" /> Generate with AI
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="Paste your notes here to automatically generate flashcards..."
                    className="min-h-[100px] bg-background"
                  />
                  <Button
                    variant="secondary"
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={suggest.isPending || pendingAiJob || !aiText.trim()}
                    onClick={() => suggest.mutate()}
                  >
                    <Bot size={16} /> {suggest.isPending || pendingAiJob ? 'Generating...' : 'Generate suggestions'}
                  </Button>
                  {(suggest.isError || streamError) && (
                    <p className="text-sm text-destructive">{streamError || errorMessage(suggest.error)}</p>
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
                                          updateSuggestion(
                                            index,
                                            { promptRichText: event.target.value },
                                            setSuggestions,
                                          )
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
                                          updateSuggestion(
                                            index,
                                            { answerRichText: event.target.value },
                                            setSuggestions,
                                          )
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
            )}
          </div>
        )}

        {activeTab === 'cards' && (
          <div className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setSubmittedCardSearch(cardSearchInput.trim());
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight">Cards in deck</h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setSelectionMode((value) => !value);
                    setSelectedCardIds(new Set());
                  }}
                >
                  <CheckSquare2 className="h-4 w-4" />
                  {selectionMode ? 'Cancel selection' : 'Select'}
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={cardSearchInput}
                  onChange={(event) => setCardSearchInput(event.target.value)}
                  placeholder="Search cards, then press Enter"
                  className="bg-background pl-9"
                />
              </div>
            </form>

            {cards.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-[200px] w-full rounded-xl" />
                <Skeleton className="h-[200px] w-full rounded-xl" />
              </div>
            ) : cardItems.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-muted-foreground text-sm">No cards yet. Create your first card!</p>
              </Card>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border bg-card pb-0">
                  {cardItems.map((card) => (
                    <DeckCardItem
                      key={card.id}
                      card={card}
                      deckId={deckId}
                      selectionMode={selectionMode}
                      selected={selectedCardIds.has(card.id)}
                      onSelectedChange={(selected) =>
                        setSelectedCardIds((current) => {
                          const next = new Set(current);
                          if (selected) next.add(card.id);
                          else next.delete(card.id);
                          return next;
                        })
                      }
                      onMove={() => openMove([card.id])}
                    />
                  ))}
                </div>
                {cards.hasNextPage && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => cards.fetchNextPage()} disabled={cards.isFetchingNextPage}>
                      {cards.isFetchingNextPage ? 'Loading...' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {activeTab === 'cards' && selectionMode && selectedCardIds.size > 0 && (
        <div className="sticky bottom-5 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur">
          <p className="pl-2 text-sm font-semibold">{selectedCardIds.size} selected</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCardIds(new Set());
                setSelectionMode(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="gap-2" onClick={() => openMove(Array.from(selectedCardIds))}>
              <FolderInput className="h-4 w-4" />
              Move
            </Button>
          </div>
        </div>
      )}

      {undoMove && (
        <div
          className="fixed bottom-5 right-5 z-40 flex max-w-sm items-center gap-3 rounded-xl border bg-slate-950 px-4 py-3 text-sm text-white shadow-2xl"
          role="status"
        >
          <span>
            {undoMove.cardIds.length} card{undoMove.cardIds.length === 1 ? '' : 's'} moved.
          </span>
          <button
            type="button"
            className="font-semibold text-teal-300 hover:text-teal-200"
            onClick={() => {
              moveCards.mutate({ cardIds: undoMove.cardIds, targetDeckId: undoMove.sourceDeckId });
              setUndoMove(null);
            }}
          >
            Undo
          </button>
          <button type="button" aria-label="Dismiss" className="text-slate-400" onClick={() => setUndoMove(null)}>
            ×
          </button>
        </div>
      )}

      <MoveCardsDialog
        open={isMoveDialogOpen}
        onOpenChange={setIsMoveDialogOpen}
        decks={deckOptions}
        currentDeckId={deckId}
        cardCount={moveCardIds.length}
        search={moveSearch}
        onSearchChange={setMoveSearch}
        isPending={moveCards.isPending}
        error={moveCards.isError ? errorMessage(moveCards.error) : null}
        onMove={(targetDeckId) => moveCards.mutate({ cardIds: moveCardIds, targetDeckId })}
      />

      {deck && canImport && (
        <CardImporterModal
          open={isImportModalOpen}
          onOpenChange={setIsImportModalOpen}
          defaultDeckName={deck.title}
          readOnlyDeckName={true}
          onImportSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
            void queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
            void queryClient.invalidateQueries({ queryKey: ['decks'] });
          }}
          apiClient={api}
        />
      )}
    </div>
  );
}

function MoveCardsDialog({
  open,
  onOpenChange,
  decks,
  currentDeckId,
  cardCount,
  search,
  onSearchChange,
  isPending,
  error,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckListItem[];
  currentDeckId: string;
  cardCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  isPending: boolean;
  error: string | null;
  onMove: (targetDeckId: string) => void;
}) {
  const filtered = decks.filter((deck) => deck.title.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Move {cardCount} card{cardCount === 1 ? '' : 's'}
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9"
            placeholder="Search destination decks"
            autoFocus
          />
        </div>
        <div className="max-h-[360px] space-y-2 overflow-y-auto">
          {filtered.map((deck) => {
            const { Icon, color } = getDeckStyle(deck.icon, deck.color);
            const disabled = deck.id === currentDeckId;
            return (
              <button
                key={deck.id}
                type="button"
                disabled={disabled || isPending}
                onClick={() => onMove(deck.id)}
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${color.iconClass}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{deck.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {deck.studyStats.totalCards} cards{deck.isDefault ? ' · Default' : ''}
                  </span>
                </span>
                {disabled && <span className="text-xs text-muted-foreground">Current</span>}
              </button>
            );
          })}
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function updateSuggestion(
  index: number,
  patch: Partial<AiSuggestedCard>,
  setSuggestions: React.Dispatch<React.SetStateAction<AiSuggestedCard[]>>,
) {
  setSuggestions((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

function DeckStatsPanel({ stats }: { stats: Awaited<ReturnType<typeof api.deckStats>> }) {
  const gradeTotal = Object.values(stats.gradeDistribution).reduce((sum, value) => sum + value, 0);
  const forecastTotal = stats.upcomingReviewForecast.reduce((sum, item) => sum + item.dueCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          Deck stats
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Retention</p>
          <p className="mt-1 text-3xl font-black text-foreground">{stats.retentionRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{stats.totalCards} active cards</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Grade distribution</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(['AGAIN', 'HARD', 'GOOD', 'EASY'] as const).map((grade) => (
              <div key={grade} className="rounded-lg border bg-muted/40 p-2 text-center">
                <p className="text-xs font-semibold text-muted-foreground">{grade}</p>
                <p className="mt-1 text-lg font-black text-foreground">{stats.gradeDistribution[grade]}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{gradeTotal} total graded reviews</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Upcoming review forecast</p>
          <div className="mt-3 flex h-16 items-end gap-1">
            {nextSevenDays(stats.upcomingReviewForecast).map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, Math.min(64, day.dueCount * 8))}px` }}
                  title={`${day.date}: ${day.dueCount} due`}
                />
                <span className="text-[10px] text-muted-foreground">{new Date(day.date).getDate()}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{forecastTotal} reviews scheduled in the next 30 days</p>
        </div>
      </CardContent>
    </Card>
  );
}

function nextSevenDays(forecast: Array<{ date: string; dueCount: number }>) {
  const byDate = new Map(forecast.map((item) => [item.date, item.dueCount]));
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const key = date.toISOString().slice(0, 10);
    return { date: key, dueCount: byDate.get(key) ?? 0 };
  });
}

function replaceMarkdownImageUrls(value: string, replacements: Map<string, string>): string {
  let nextValue = value;
  replacements.forEach((replacementUrl, pendingUrl) => {
    nextValue = nextValue.split(pendingUrl).join(replacementUrl);
  });
  return nextValue;
}

function removeMarkdownImageUrl(value: string, url: string): string {
  const escapedUrl = escapeRegExp(url);
  return value
    .replace(new RegExp(`\\n?\\n?!\\[[^\\]]*]\\(${escapedUrl}\\)`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePartialCards(text: string): AiSuggestedCard[] {
  const cards: AiSuggestedCard[] = [];

  // Try parsing as JSON first in case it's older/cached JSON output
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
          .map((t) => t.trim())
          .filter(Boolean);
      } else {
        if (currentField === 'prompt') {
          promptRichText = (promptRichText ? promptRichText + '\n' : '') + line;
        } else if (currentField === 'answer') {
          answerRichText = (answerRichText ? answerRichText + '\n' : '') + line;
        }
      }
    }

    const cleanPrompt = promptRichText.trim();
    const cleanAnswer = answerRichText.trim();

    if (cleanPrompt || cleanAnswer) {
      cards.push({
        promptRichText: cleanPrompt,
        answerRichText: cleanAnswer,
        tags,
      });
    }
  }

  return cards;
}
