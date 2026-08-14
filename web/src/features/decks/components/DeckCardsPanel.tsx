import { useState } from 'react';
import { CheckSquare2, FolderInput, Search } from 'lucide-react';
import type { Card as APICard } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { DeckCardItem } from './DeckCardItem';

type DeckCardsPanelProps = {
  deckId: string;
  cardItems: APICard[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  onSearch: (value: string) => void;
  selectionMode: boolean;
  selectedCardIds: Set<string>;
  onToggleSelectionMode: () => void;
  onSelectedChange: (cardId: string, selected: boolean) => void;
  onMoveCard: (cardId: string) => void;
  onCancelSelection: () => void;
  onMoveSelected: () => void;
};

export function DeckCardsPanel({
  deckId,
  cardItems,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onSearch,
  selectionMode,
  selectedCardIds,
  onToggleSelectionMode,
  onSelectedChange,
  onMoveCard,
  onCancelSelection,
  onMoveSelected,
}: DeckCardsPanelProps) {
  const [searchInput, setSearchInput] = useState('');

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(searchInput.trim());
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Cards in deck</h2>
          <Button variant="outline" size="sm" className="gap-2" onClick={onToggleSelectionMode}>
            <CheckSquare2 className="h-4 w-4" />
            {selectionMode ? 'Cancel selection' : 'Select'}
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search cards, then press Enter"
            className="bg-background pl-9"
          />
        </div>
      </form>

      {isLoading ? (
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
                onSelectedChange={(selected) => onSelectedChange(card.id, selected)}
                onMove={() => onMoveCard(card.id)}
              />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={onFetchNextPage} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {selectionMode && selectedCardIds.size > 0 && (
        <div className="sticky bottom-5 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur">
          <p className="pl-2 text-sm font-semibold">{selectedCardIds.size} selected</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancelSelection}>
              Cancel
            </Button>
            <Button size="sm" className="gap-2" onClick={onMoveSelected}>
              <FolderInput className="h-4 w-4" />
              Move
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
