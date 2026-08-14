import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal, Pencil, Play, Trash2, UploadCloud } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { DeckColor, DeckIcon } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { useAuth } from '@/shared/auth/AuthProvider';
import { DeckStylePicker, getDeckStyle } from '../utils/deckStyles';

type Deck = Awaited<ReturnType<typeof api.deck>>;
type DeckStats = Awaited<ReturnType<typeof api.deckStats>>;

export function DeckHeader({
  deck,
  deckId,
  stats,
  onImport,
}: {
  deck: Deck | undefined;
  deckId: string;
  stats: DeckStats | undefined;
  onImport: () => void;
}) {
  const canImport = useAuth().user?.permissions.includes('CARD_IMPORT') ?? false;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<DeckIcon>('BOOK');
  const [color, setColor] = useState<DeckColor>('TEAL');

  useEffect(() => {
    if (!deck || isEditing) return;
    setTitle(deck.title);
    setDescription(deck.description ?? '');
    setIcon(deck.icon);
    setColor(deck.color);
  }, [deck, isEditing]);

  const updateDeck = useMutation({
    mutationFn: () =>
      api.updateDeck(deckId, {
        title: title.trim(),
        description: description.trim() || null,
        icon,
        color,
      }),
    onSuccess: () => {
      setIsEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      void queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
    },
  });

  const deleteDeck = useMutation({
    mutationFn: () => api.deleteDeck(deckId),
    onSuccess: () => {
      setIsDeleteDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      navigate('/learn/decks');
    },
  });

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-7 ${deck ? getDeckStyle(deck.icon, deck.color).color.softClass : 'bg-card'}`}
    >
      {deck && <div className={`absolute inset-y-0 left-0 w-2 ${getDeckStyle(deck.icon, deck.color).color.railClass}`} />}
      <div className="flex items-start gap-3 sm:gap-4">
        <Button variant="outline" size="icon" className="shrink-0 bg-background/80" asChild>
          <Link to="/learn/decks" aria-label="Back to decks">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          {isEditing ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (title.trim()) updateDeck.mutate();
              }}
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className="bg-background text-lg font-semibold"
                  placeholder="Deck title"
                />
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  className="bg-background"
                  placeholder="Description"
                />
              </div>
              <DeckStylePicker icon={icon} color={color} onIconChange={setIcon} onColorChange={setColor} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!title.trim() || updateDeck.isPending}>
                  {updateDeck.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTitle(deck?.title ?? '');
                    setDescription(deck?.description ?? '');
                    setIcon(deck?.icon ?? 'BOOK');
                    setColor(deck?.color ?? 'TEAL');
                    setIsEditing(false);
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
                    const { Icon, color: styleColor } = getDeckStyle(deck.icon, deck.color);
                    return (
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${styleColor.iconClass}`}
                      >
                        <Icon className="h-7 w-7" />
                      </div>
                    );
                  })()}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {deck?.isDefault && (
                      <span className="rounded-full bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                        Default
                      </span>
                    )}
                  </div>
                  {stats && (
                    <p className="mt-2 text-sm font-medium text-muted-foreground">
                      {stats.totalCards} cards · {stats.upcomingReviewForecast.reduce((sum, item) => sum + item.dueCount, 0)}{' '}
                      scheduled
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
                          setTitle(deck.title);
                          setDescription(deck.description ?? '');
                          setIcon(deck.icon);
                          setColor(deck.color);
                          setIsEditing(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit deck
                      </DropdownMenuItem>
                      {canImport && (
                        <DropdownMenuItem onClick={onImport}>
                          <UploadCloud className="mr-2 h-4 w-4" />
                          Import cards
                        </DropdownMenuItem>
                      )}
                      {!deck.isDefault && (
                        <DropdownMenuItem className="text-destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete deck
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ConfirmDialog
                    open={isDeleteDialogOpen}
                    onOpenChange={setIsDeleteDialogOpen}
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
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}
