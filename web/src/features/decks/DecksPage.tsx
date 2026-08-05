import { FormEvent, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, BookCopy, LoaderCircle, Plus, Search, UploadCloud } from 'lucide-react';
import { api, type DeckListItem } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Input } from '@/shared/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog';
import { CardImporterModal } from './components/CardImporterModal';
import { useAuth } from '@/shared/auth/AuthProvider';
import type { DeckColor, DeckIcon } from '@/shared/api/types';
import type { InfiniteData } from '@tanstack/react-query';
import { DeckStylePicker, getDeckStyle } from './utils/deckStyles';

export function DecksPage() {
  const canImport = useAuth().user?.permissions?.includes('CARD_IMPORT') ?? false;
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<DeckIcon>('BOOK');
  const [color, setColor] = useState<DeckColor>('TEAL');
  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const decks = useInfiniteQuery({
    queryKey: ['decks', submittedSearch],
    queryFn: ({ pageParam }) => api.decks({ cursor: pageParam, q: submittedSearch }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });
  const deckItems = decks.data?.pages.flatMap((page) => page.data) ?? [];

  const create = useMutation({
    mutationFn: () => api.createDeck({ title, description, icon, color }),
    onSuccess: async (created) => {
      setTitle('');
      setDescription('');
      setIcon('BOOK');
      setColor('TEAL');
      setIsCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['decks'] });
      if (!submittedSearch) {
        queryClient.setQueryData<
          InfiniteData<{ data: DeckListItem[]; meta: { nextCursor?: string | null; hasNextPage: boolean } }>
        >(['decks', submittedSearch], (current) => insertDeckIntoFirstPage(current, created as DeckListItem));
      }
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) create.mutate();
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        kicker="Spaced Repetition"
        title="Your decks"
        description="Create focused collections and keep learning organized."
      >
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New deck
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New deck</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={submit}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Deck title"
                className="w-full bg-background"
                aria-label="New deck title"
                maxLength={120}
              />
              <DeckStylePicker icon={icon} color={color} onIconChange={setIcon} onColorChange={setColor} />
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full bg-background"
                aria-label="New deck description"
                maxLength={500}
              />
              <Button type="submit" disabled={!title.trim() || create.isPending} className="w-full gap-2">
                {create.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {create.isPending ? 'Creating' : 'Create deck'}
              </Button>
            </form>
            {create.isError && (
              <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="h-4 w-4" /> Could not create the deck. Please try again.
              </p>
            )}
          </DialogContent>
        </Dialog>

        {canImport && (
          <Button variant="outline" className="gap-2" onClick={() => setIsImportOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            Import deck
          </Button>
        )}
      </PageHeader>

      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedSearch(searchInput.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search your decks"
          className="bg-card pl-9"
          aria-label="Search decks"
        />
      </form>

      {decks.isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
          <div className="mb-4 rounded-xl bg-destructive/10 p-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="font-semibold text-foreground">Your decks couldn't load</h2>
          <p className="mb-5 mt-1 max-w-sm text-sm text-muted-foreground">Try again to reconnect to your library.</p>
          <Button variant="outline" onClick={() => decks.refetch()}>
            Try again
          </Button>
        </div>
      ) : decks.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-[120px] w-full rounded-xl" />
          <Skeleton className="h-[120px] w-full rounded-xl" />
          <Skeleton className="h-[120px] w-full rounded-xl" />
        </div>
      ) : deckItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 p-12 text-center">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <BookCopy className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {submittedSearch ? 'No matching decks' : 'Create your first deck'}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-sm mb-6">
            {submittedSearch
              ? `Nothing matched "${submittedSearch}". Try a different title or description.`
              : 'Give a topic a home, then add the cards you want to remember.'}
          </p>
          {submittedSearch && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchInput('');
                setSubmittedSearch('');
              }}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {deckItems.map((deck) => (
            <DeckTile deck={deck} key={deck.id} />
          ))}
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 p-5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="h-6 w-6" />
            Create a new deck
          </button>
        </div>
      )}
      {decks.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => decks.fetchNextPage()} disabled={decks.isFetchingNextPage}>
            {decks.isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
      {canImport && isImportOpen && (
        <CardImporterModal
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          readOnlyDeckName={false}
          onImportSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['decks'] });
          }}
          apiClient={api}
        />
      )}
    </div>
  );
}

function insertDeckIntoFirstPage(
  current:
    InfiniteData<{ data: DeckListItem[]; meta: { nextCursor?: string | null; hasNextPage: boolean } }> | undefined,
  deck: DeckListItem,
) {
  if (!current?.pages.length) return current;
  const pages = current.pages.map((page, index) => {
    const data = page.data.filter((item) => item.id !== deck.id);
    if (index === 0) data.push(deck);
    return { ...page, data: data.sort(compareDecks) };
  });
  return { ...current, pages };
}

function compareDecks(left: DeckListItem, right: DeckListItem) {
  if (left.isDefault !== right.isDefault) return Number(right.isDefault) - Number(left.isDefault);
  return right.id.localeCompare(left.id);
}

function DeckTile({ deck }: { deck: DeckListItem }) {
  const style = getDeckStyle(deck.icon, deck.color);
  const Icon = style.Icon;
  const reviewedPercent = deck.studyStats.totalCards
    ? Math.round((deck.studyStats.reviewedCount / deck.studyStats.totalCards) * 100)
    : 0;
  const actionLabel =
    deck.studyStats.dueCount > 0
      ? `Review ${deck.studyStats.dueCount} due`
      : deck.studyStats.newCount > 0
        ? `Study ${deck.studyStats.newCount} new`
        : 'Browse cards';

  return (
    <Card className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden border-border/80 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-border/70 dark:bg-card/95">
      <div className={`absolute inset-y-0 left-0 w-1.5 ${style.color.railClass}`} aria-hidden="true" />
      <CardHeader className="space-y-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.color.iconClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base text-foreground">
                <Link className="hover:text-primary hover:underline" to={`/learn/decks/${deck.id}`}>
                  {deck.title}
                </Link>
              </CardTitle>
              <CardDescription className="mt-1 line-clamp-1 text-xs">
                {formatLastStudied(deck.studyStats.lastStudiedAt)}
              </CardDescription>
              {deck.isDefault && (
                <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Default
                </span>
              )}
            </div>
          </div>
          {deck.studyStats.dueCount > 0 && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
              {deck.studyStats.dueCount} due
            </span>
          )}
        </div>
        <CardDescription className="line-clamp-2 min-h-[2.5rem]">
          {deck.description || 'No description provided.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Cards reviewed</span>
            <span className="tabular-nums">{reviewedPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${style.color.railClass}`} style={{ width: `${reviewedPercent}%` }} />
          </div>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{deck.studyStats.totalCards} total</span>
          <span>{deck.studyStats.newCount} new</span>
          <span>{deck.studyStats.dueCount} due</span>
        </div>
        <Button variant="outline" className="w-full gap-2" asChild>
          <Link to={`/learn/review?deckId=${deck.id}`}>
            <BookCopy className="h-4 w-4" />
            {actionLabel}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function formatLastStudied(value?: string | null): string {
  if (!value) return 'Not studied yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not studied yet';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Studied today';
  if (days === 1) return 'Studied yesterday';
  return `Studied ${days} days ago`;
}
