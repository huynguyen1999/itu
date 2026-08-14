import { FormEvent, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Card as APICard } from '@/shared/api/client';
import { MarkdownCardEditor } from '@/shared/editor/MarkdownCardEditor';
import { MarkdownPreview } from '@/shared/markdown/MarkdownPreview';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/ui/card';
import { CardImporterModal } from './components/CardImporterModal';
import { DeckAiCardGenerator } from './components/DeckAiCardGenerator';
import { DeckCardsPanel } from './components/DeckCardsPanel';
import { DeckHeader } from './components/DeckHeader';
import { DeckStatsPanel } from './components/DeckStatsPanel';
import { MoveCardsDialog } from './components/MoveCardsDialog';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';
import { useAuth } from '@/shared/auth/AuthProvider';
import { PageHeader } from '@/shared/ui/PageHeader';

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
  const [isReverse, setIsReverse] = useState(false);
  const [promptRichText, setPrompt] = useState('');
  const [answerRichText, setAnswer] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingCardImage[]>([]);
  const [activeTab, setActiveTab] = useState<'cards' | 'add' | 'insights'>('cards');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [moveCardIds, setMoveCardIds] = useState<string[]>([]);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [moveSearch, setMoveSearch] = useState('');
  const [undoMove, setUndoMove] = useState<{ cardIds: string[]; sourceDeckId: string } | null>(null);
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
    enabled: isMoveDialogOpen,
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
      <PageHeader
        kicker="Learn"
        title={deck?.title || 'Deck details'}
        description={deck?.description || 'Manage flashcards and study material.'}
      />
      <DeckHeader deck={deck} deckId={deckId} stats={statsQuery.data} onImport={() => setIsImportModalOpen(true)} />

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

            {canUseAi && <DeckAiCardGenerator deckId={deckId} canUseAi={canUseAi} />}
          </div>
        )}

        {activeTab === 'cards' && (
          <DeckCardsPanel
            deckId={deckId}
            cardItems={cardItems}
            isLoading={cards.isLoading}
            hasNextPage={Boolean(cards.hasNextPage)}
            isFetchingNextPage={cards.isFetchingNextPage}
            onFetchNextPage={() => void cards.fetchNextPage()}
            onSearch={setSubmittedCardSearch}
            selectionMode={selectionMode}
            selectedCardIds={selectedCardIds}
            onToggleSelectionMode={() => {
              setSelectionMode((value) => !value);
              setSelectedCardIds(new Set());
            }}
            onSelectedChange={(cardId, selected) =>
              setSelectedCardIds((current) => {
                const next = new Set(current);
                if (selected) next.add(cardId);
                else next.delete(cardId);
                return next;
              })
            }
            onMoveCard={(cardId) => openMove([cardId])}
            onCancelSelection={() => {
              setSelectedCardIds(new Set());
              setSelectionMode(false);
            }}
            onMoveSelected={() => openMove(Array.from(selectedCardIds))}
          />
        )}
      </div>

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
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
