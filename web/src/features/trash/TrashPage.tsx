import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveRestore,
  ChevronLeft,
  Dumbbell,
  FileImage,
  FileText,
  Flag,
  Layers3,
  LoaderCircle,
  ReceiptText,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/shared/api/client';
import type {
  Card,
  CardImage,
  Deck,
  ProductivityTask,
  TrashBudgetTransaction,
  TrashExerciseDefinition,
  TrashGymWorkout,
  TrashJournalEntry,
  TrashSnapshot,
} from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Skeleton } from '@/shared/ui/skeleton';

type TrashFilter = 'All' | 'Tasks' | 'Journal' | 'Budget' | 'Gym';
type TrashKind = 'task' | 'deck' | 'card' | 'cardImage' | 'journal' | 'budget' | 'gymWorkout' | 'gymExercise';

interface TrashRow {
  id: string;
  kind: TrashKind;
  title: string;
  typeLabel: string;
  deletedAt?: string | null;
  detail?: string;
  icon: LucideIcon;
}

interface DeleteTarget {
  row: TrashRow;
}

const FILTERS: TrashFilter[] = ['All', 'Tasks', 'Journal', 'Budget', 'Gym'];

export function TrashPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TrashFilter>('All');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trashQuery = useQuery({ queryKey: ['trash'], queryFn: () => api.trash() });
  const snapshot = trashQuery.data;
  const rows = snapshot ? rowsForFilter(snapshot, filter) : [];
  const total = snapshot ? rowsForFilter(snapshot, 'All').length : 0;

  const showMessage = useCallback((text: string, error = false) => {
    setMessage({ text, error });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);

  const removeFromTrash = useCallback(
    (row: TrashRow) => {
      queryClient.setQueryData<TrashSnapshot>(['trash'], (current) => {
        if (!current) return current;
        const key = trashKey(row.kind);
        if (key === 'decks' || key === 'cards' || key === 'cardImages' || key === 'tasks') {
          return { ...current, [key]: current[key].filter((item) => item.id !== row.id) };
        }
        return { ...current, [key]: (current[key] ?? []).filter((item) => item.id !== row.id) };
      });
    },
    [queryClient],
  );

  const restoreMutation = useMutation<unknown, Error, TrashRow>({
    mutationFn: (row) => restoreRow(row),
    onSuccess: (_, row) => {
      removeFromTrash(row);
      invalidateRestoredResource(queryClient, row.kind);
      showMessage(`${row.typeLabel} restored.`);
    },
    onError: () => showMessage('Could not restore this item. Try again.', true),
  });

  const deleteMutation = useMutation<unknown, Error, TrashRow>({
    mutationFn: (row) => deleteRow(row),
    onSuccess: (_, row) => {
      setDeleteTarget(null);
      removeFromTrash(row);
      showMessage(`${row.typeLabel} permanently deleted.`);
    },
    onError: () => showMessage('Could not permanently delete this item.', true),
  });

  const isDeleting = deleteMutation.isPending;
  const isInitialLoading = trashQuery.isLoading && !snapshot;

  return (
    <div className="space-y-7">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Recover removed content
      </Link>

      <PageHeader
        kicker="System & Maintenance"
        title="Trash"
        description="Deleted items remain recoverable until they are permanently removed."
        stickyControls={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap gap-1 rounded-xl border bg-muted/30 p-1"
              role="tablist"
              aria-label="Trash filters"
            >
              {FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={filter === option}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    filter === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setFilter(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            {trashQuery.isFetching && !isInitialLoading && (
              <span className="text-xs text-muted-foreground">Refreshing…</span>
            )}
          </div>
        }
      >
        <div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card/80 px-3.5 text-xs font-bold text-muted-foreground shadow-sm">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {total} item{total === 1 ? '' : 's'}
        </div>
      </PageHeader>

      {isInitialLoading && <TrashLoading />}

      {trashQuery.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <span>
            {snapshot ? 'Trash could not be refreshed. Showing the last saved items.' : 'Trash could not be loaded.'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void trashQuery.refetch()}
            disabled={trashQuery.isFetching}
          >
            {trashQuery.isFetching && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Retry
          </Button>
        </div>
      )}

      {!isInitialLoading && snapshot && rows.length > 0 && (
        <div className="divide-y rounded-2xl border bg-card" aria-live="polite">
          {rows.map((row) => (
            <TrashRowItem
              key={`${row.kind}:${row.id}`}
              row={row}
              isPending={restoreMutation.isPending && restoreMutation.variables?.id === row.id}
              onRestore={() => restoreMutation.mutate(row)}
              onDelete={() => setDeleteTarget({ row })}
            />
          ))}
        </div>
      )}

      {!isInitialLoading && snapshot && rows.length === 0 && (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <Trash2 className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">
            {total === 0 ? 'Trash is empty' : `No ${filter.toLowerCase()} items`}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {total === 0
              ? 'Deleted content will appear here and can be restored.'
              : 'Try another filter to see deleted content.'}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}
        title="Delete permanently?"
        description={
          deleteTarget ? `This will permanently delete “${deleteTarget.row.title}”. This action cannot be undone.` : ''
        }
        confirmLabel="Delete permanently"
        isPending={isDeleting}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.row)}
      />

      {message && (
        <div
          role={message.error ? 'alert' : 'status'}
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-lg"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

function TrashRowItem({
  row,
  isPending,
  onRestore,
  onDelete,
}: {
  row: TrashRow;
  isPending: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const Icon = row.icon;
  return (
    <article className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">{row.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {row.typeLabel}
          {row.detail ? ` · ${row.detail}` : ''}
          {row.deletedAt ? ` · Deleted ${relativeTime(row.deletedAt)}` : ''}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onRestore} disabled={isPending}>
          {isPending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Restore
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={isPending}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete permanently
        </Button>
      </div>
    </article>
  );
}

export function rowsForFilter(snapshot: TrashSnapshot, filter: TrashFilter): TrashRow[] {
  const tasks = snapshot.tasks.map((task) => taskRow(task));
  const journal = (snapshot.journalEntries ?? []).map((entry) => journalRow(entry));
  const budget = (snapshot.budgetTransactions ?? []).map((transaction) => budgetRow(transaction));
  const gym = [
    ...(snapshot.gymWorkouts ?? []).map((workout) => workoutRow(workout)),
    ...(snapshot.gymExercises ?? []).map((exercise) => exerciseRow(exercise)),
  ];
  if (filter === 'Tasks') return tasks;
  if (filter === 'Journal') return journal;
  if (filter === 'Budget') return budget;
  if (filter === 'Gym') return gym;
  return [
    ...tasks,
    ...journal,
    ...budget,
    ...gym,
    ...snapshot.decks.map((deck) => deckRow(deck)),
    ...snapshot.cards.map((card) => cardRow(card)),
    ...snapshot.cardImages.map((image) => cardImageRow(image)),
  ];
}

function taskRow(task: ProductivityTask): TrashRow {
  return { id: task.id, kind: 'task', title: task.title, typeLabel: 'Task', deletedAt: task.deletedAt, icon: Flag };
}

function journalRow(entry: TrashJournalEntry): TrashRow {
  return {
    id: entry.id,
    kind: 'journal',
    title: entry.title || 'Untitled entry',
    typeLabel: `Journal entry · ${entry.kind === 'WEEKLY_REVIEW' ? 'Weekly Review' : 'Note'}`,
    deletedAt: entry.deletedAt,
    icon: FileText,
  };
}

function budgetRow(transaction: TrashBudgetTransaction): TrashRow {
  const category = transaction.categoryRel?.name || transaction.category || 'Uncategorized';
  return {
    id: transaction.id,
    kind: 'budget',
    title: transaction.merchant || category,
    typeLabel: 'Budget transaction',
    detail: `${transaction.amount} ${transaction.currency}`,
    deletedAt: transaction.deletedAt,
    icon: ReceiptText,
  };
}

function workoutRow(workout: TrashGymWorkout): TrashRow {
  return {
    id: workout.id,
    kind: 'gymWorkout',
    title: workout.title || 'Gym workout',
    typeLabel: 'Gym workout',
    detail: workout.status || undefined,
    deletedAt: workout.deletedAt,
    icon: Dumbbell,
  };
}

function exerciseRow(exercise: TrashExerciseDefinition): TrashRow {
  return {
    id: exercise.id,
    kind: 'gymExercise',
    title: exercise.name,
    typeLabel: 'Exercise definition',
    detail: exercise.metricType || undefined,
    deletedAt: exercise.deletedAt,
    icon: Dumbbell,
  };
}

function deckRow(deck: Deck): TrashRow {
  const deletedAt =
    (deck as Deck & { deletedAt?: string | null; updatedAt?: string | null }).deletedAt ??
    (deck as Deck & { updatedAt?: string | null }).updatedAt;
  return { id: deck.id, kind: 'deck', title: deck.title, typeLabel: 'Flashcard deck', deletedAt, icon: Layers3 };
}

function cardRow(card: Card): TrashRow {
  return {
    id: card.id,
    kind: 'card',
    title: plainText(card.promptRichText) || 'Deleted flashcard',
    typeLabel: 'Flashcard',
    deletedAt: card.updatedAt,
    icon: ArchiveRestore,
  };
}

function cardImageRow(image: CardImage): TrashRow {
  return {
    id: image.id,
    kind: 'cardImage',
    title: 'Card image',
    typeLabel: 'Flashcard image',
    deletedAt: image.deletedAt,
    icon: FileImage,
  };
}

function trashKey(
  kind: TrashKind,
):
  | 'decks'
  | 'cards'
  | 'cardImages'
  | 'tasks'
  | 'journalEntries'
  | 'budgetTransactions'
  | 'gymWorkouts'
  | 'gymExercises' {
  if (kind === 'deck') return 'decks';
  if (kind === 'card') return 'cards';
  if (kind === 'cardImage') return 'cardImages';
  if (kind === 'task') return 'tasks';
  if (kind === 'journal') return 'journalEntries';
  if (kind === 'budget') return 'budgetTransactions';
  if (kind === 'gymWorkout') return 'gymWorkouts';
  return 'gymExercises';
}

function restoreRow(row: TrashRow) {
  if (row.kind === 'deck') return api.restoreDeck(row.id);
  if (row.kind === 'card') return api.restoreCard(row.id);
  if (row.kind === 'cardImage') return api.restoreCardImage(row.id);
  if (row.kind === 'task') return api.restoreTrashTask(row.id);
  if (row.kind === 'journal') return api.restoreTrashJournalEntry(row.id);
  if (row.kind === 'budget') return api.restoreTrashBudgetTransaction(row.id);
  if (row.kind === 'gymWorkout') return api.restoreTrashGymWorkout(row.id);
  return api.restoreTrashGymExercise(row.id);
}

function deleteRow(row: TrashRow) {
  if (row.kind === 'deck') return api.deleteTrashDeck(row.id);
  if (row.kind === 'card') return api.deleteTrashCard(row.id);
  if (row.kind === 'cardImage') return api.deleteTrashCardImage(row.id);
  if (row.kind === 'task') return api.deleteTrashTask(row.id);
  if (row.kind === 'journal') return api.deleteTrashJournalEntry(row.id);
  if (row.kind === 'budget') return api.deleteTrashBudgetTransaction(row.id);
  if (row.kind === 'gymWorkout') return api.deleteTrashGymWorkout(row.id);
  return api.deleteTrashGymExercise(row.id);
}

function invalidateRestoredResource(queryClient: ReturnType<typeof useQueryClient>, kind: TrashKind) {
  const prefixes: Record<TrashKind, string[]> = {
    task: ['tasks', 'dashboard'],
    deck: ['decks', 'deck', 'dashboard'],
    card: ['cards', 'deck', 'due'],
    cardImage: ['cards', 'deck'],
    journal: ['journal-entries', 'journal-dashboard', 'journal'],
    budget: ['budget'],
    gymWorkout: ['gym'],
    gymExercise: ['gym'],
  };
  for (const prefix of prefixes[kind]) void queryClient.invalidateQueries({ queryKey: [prefix] });
}

function plainText(value: string): string {
  return value
    .replace(/[#*_`>\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function relativeTime(value: string): string {
  const elapsedDays = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) return 'today';
  if (elapsedDays === 1) return 'yesterday';
  return `${elapsedDays} days ago`;
}

function TrashLoading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading trash">
      {[1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-[76px] rounded-2xl" />
      ))}
    </div>
  );
}
