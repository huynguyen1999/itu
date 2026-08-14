import { Search } from 'lucide-react';
import type { DeckListItem } from '@/shared/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { getDeckStyle } from '../utils/deckStyles';

export function MoveCardsDialog({
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
