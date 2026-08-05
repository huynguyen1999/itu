import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveRestore,
  CheckSquare2,
  ChevronLeft,
  Flag,
  Inbox,
  Layers3,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Skeleton } from '@/shared/ui/skeleton';
import { api } from '@/shared/api/client';
import type { Card as ApiCard, Deck } from '@/shared/api/client';
import type { ProductivityTask } from '@/shared/api/types';
import { MarkdownPreview } from '@/shared/markdown/MarkdownPreview';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

// ─── Types ───────────────────────────────────────────────────────────────────

type PermanentDeleteTarget =
  | { type: 'deck'; id: string; label: string }
  | { type: 'card'; id: string; label: string; deckId: string }
  | { type: 'task'; id: string; label: string };

type ToastKind = 'restore' | 'delete';

interface ToastState {
  open: boolean;
  message: string;
  kind: ToastKind;
}

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: 'text-rose-500',
  MEDIUM: 'text-amber-500',
  LOW: 'text-blue-500',
  NONE: 'text-muted-foreground',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function TrashPage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PermanentDeleteTarget | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: '', kind: 'restore' });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trashQuery = useQuery({ queryKey: ['trash'], queryFn: () => api.trash() });

  // ── Toast helper ────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, kind: ToastKind) => {
    setToast({ open: true, message, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ── Shared invalidations ────────────────────────────────────────────────

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['trash'] });
    void queryClient.invalidateQueries({ queryKey: ['decks'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
    void queryClient.invalidateQueries({ queryKey: ['due'] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  // ── Mutations ───────────────────────────────────────────────────────────

  const restoreDeck = useMutation({
    mutationFn: (deckId: string) => api.restoreDeck(deckId),
    onSuccess: () => {
      invalidateAll();
      showToast('Deck restored.', 'restore');
    },
  });

  const restoreCard = useMutation({
    mutationFn: (card: ApiCard) => api.restoreCard(card.id),
    onSuccess: () => {
      invalidateAll();
      showToast('Card restored.', 'restore');
    },
  });

  const restoreTask = useMutation({
    mutationFn: (taskId: string) => api.restoreTrashTask(taskId),
    onSuccess: () => {
      invalidateAll();
      showToast('Task restored.', 'restore');
    },
  });

  const deleteDeck = useMutation({
    mutationFn: (deckId: string) => api.deleteTrashDeck(deckId),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateAll();
      showToast('Deck permanently deleted.', 'delete');
    },
  });

  const deleteCard = useMutation({
    mutationFn: (target: Extract<PermanentDeleteTarget, { type: 'card' }>) => api.deleteTrashCard(target.id),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateAll();
      showToast('Card permanently deleted.', 'delete');
    },
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => api.deleteTrashTask(taskId),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidateAll();
      showToast('Task permanently deleted.', 'delete');
    },
  });

  const snapshot = trashQuery.data;
  const totalItems = (snapshot?.decks.length ?? 0) + (snapshot?.cards.length ?? 0) + (snapshot?.tasks.length ?? 0);

  return (
    <div className="space-y-8">
      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" />
        Recover removed content
      </Link>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <PageHeader
        kicker="System & Maintenance"
        title="Trash"
        description="Deleted items remain recoverable for 30 days before they are permanently removed."
      >
        <SummaryPill total={totalItems} />
      </PageHeader>

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {trashQuery.isLoading && <TrashLoading />}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {trashQuery.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {trashQuery.error instanceof Error ? trashQuery.error.message : 'Could not load trash'}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────── */}
      {!trashQuery.isLoading && !trashQuery.isError && snapshot && totalItems > 0 && (
        <div className="space-y-10">
          {/* Tasks */}
          {snapshot.tasks.length > 0 && (
            <TrashSection
              title="Tasks"
              icon={CheckSquare2}
              iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
              count={snapshot.tasks.length}
              actions={
                snapshot.tasks.length > 1 && (
                  <button
                    type="button"
                    className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => {
                      snapshot.tasks.forEach((t) => restoreTask.mutate(t.id));
                    }}
                  >
                    Restore all
                  </button>
                )
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {snapshot.tasks.map((task) => (
                  <TaskTrashItem
                    key={task.id}
                    task={task}
                    isPending={restoreTask.isPending && restoreTask.variables === task.id}
                    onRestore={() => restoreTask.mutate(task.id)}
                    onDelete={() => setDeleteTarget({ type: 'task', id: task.id, label: task.title })}
                  />
                ))}
              </div>
            </TrashSection>
          )}

          {/* Decks */}
          <TrashSection
            title="Decks"
            icon={Layers3}
            iconBg="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
            count={snapshot.decks.length}
          >
            {snapshot.decks.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {snapshot.decks.map((deck) => (
                  <DeckTrashItem
                    key={deck.id}
                    deck={deck}
                    isPending={restoreDeck.isPending && restoreDeck.variables === deck.id}
                    onRestore={() => restoreDeck.mutate(deck.id)}
                    onDelete={() => setDeleteTarget({ type: 'deck', id: deck.id, label: deck.title })}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                icon={Layers3}
                title="No deleted decks"
                description="Deleted decks will appear here until they expire."
              />
            )}
          </TrashSection>

          {/* Cards */}
          <TrashSection
            title="Cards"
            icon={ArchiveRestore}
            iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
            count={snapshot.cards.length}
          >
            {snapshot.cards.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {snapshot.cards.map((card) => (
                  <CardTrashItem
                    key={card.id}
                    card={card}
                    isPending={restoreCard.isPending && restoreCard.variables?.id === card.id}
                    onRestore={() => restoreCard.mutate(card)}
                    onDelete={() =>
                      setDeleteTarget({
                        type: 'card',
                        id: card.id,
                        label: card.promptRichText || 'Deleted card',
                        deckId: card.deckId,
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                icon={ArchiveRestore}
                title="No deleted cards"
                description="Deleted cards will appear here until they expire."
              />
            )}
          </TrashSection>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!trashQuery.isLoading && !trashQuery.isError && snapshot && totalItems === 0 && (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Inbox className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Trash is empty</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Deleted decks, cards, and tasks will appear here and can be restored within 30 days.
          </p>
        </div>
      )}

      {/* ── Confirm dialog ────────────────────────────────────────────── */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete permanently?"
        description={
          deleteTarget
            ? deleteTarget.type === 'deck'
              ? `This will permanently remove deck "${deleteTarget.label}" from trash. Its cards will move to Recovered Cards.`
              : deleteTarget.type === 'task'
                ? `This will permanently delete "${deleteTarget.label}". This action cannot be undone.`
                : 'This will permanently remove this card from iTu. It will no longer be recoverable from trash.'
            : ''
        }
        confirmLabel="Delete permanently"
        isPending={deleteDeck.isPending || deleteCard.isPending || deleteTask.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === 'deck') deleteDeck.mutate(deleteTarget.id);
          if (deleteTarget.type === 'card') deleteCard.mutate(deleteTarget);
          if (deleteTarget.type === 'task') deleteTask.mutate(deleteTarget.id);
        }}
      />

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 right-6 z-50 flex max-w-xs items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-sm font-medium text-card-foreground shadow-lg transition-all duration-200 sm:bottom-8 sm:right-8 ${
          toast.open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            toast.kind === 'restore'
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {toast.kind === 'restore' ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
        </span>
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

// ─── Summary Pill ────────────────────────────────────────────────────────────

function SummaryPill({ total }: { total: number }) {
  return (
    <div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card/80 px-3.5 text-xs font-bold text-muted-foreground shadow-sm">
      <Trash2 className="h-3.5 w-3.5" />
      <span>
        {total} item{total === 1 ? '' : 's'}
      </span>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function TrashSection({
  title,
  count,
  icon: Icon,
  iconBg,
  actions,
  children,
}: {
  title: string;
  count: number;
  icon: typeof Trash2;
  iconBg: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-bold text-muted-foreground">
            {count}
          </span>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// ─── Card Components ─────────────────────────────────────────────────────────

function TaskTrashItem({
  task,
  isPending,
  onRestore,
  onDelete,
}: {
  task: ProductivityTask;
  isPending: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const deletedDaysAgo = task.deletedAt
    ? Math.round((Date.now() - new Date(task.deletedAt).getTime()) / 86_400_000)
    : null;

  const daysLeft = deletedDaysAgo !== null ? 30 - deletedDaysAgo : null;

  return (
    <article className="trash-card group relative min-h-[148px] rounded-xl border bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-muted-foreground/20 hover:shadow-md">
      {/* Left accent bar — visible on hover */}
      <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full bg-transparent transition-colors duration-150 group-hover:bg-primary" />

      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Flag className={`h-4 w-4 ${PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.NONE}`} />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-foreground">{task.title}</h3>

          {task.descriptionMarkdown && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.descriptionMarkdown}</p>
          )}

          {deletedDaysAgo !== null && daysLeft !== null && (
            <p className="mt-3 text-xs text-muted-foreground">
              Deleted {deletedDaysAgo === 0 ? 'today' : `${deletedDaysAgo} day${deletedDaysAgo === 1 ? '' : 's'} ago`}
              <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              </span>
            </p>
          )}
        </div>
      </div>

      <TrashActions isPending={isPending} onRestore={onRestore} onDelete={onDelete} restoreLabel="Restore" />
    </article>
  );
}

function DeckTrashItem({
  deck,
  isPending,
  onRestore,
  onDelete,
}: {
  deck: Deck;
  isPending: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="trash-card group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-muted-foreground/20 hover:shadow-md">
      {/* Left accent bar — visible on hover */}
      <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full bg-transparent transition-colors duration-150 group-hover:bg-primary" />

      <div className="border-b bg-muted/20 px-4 py-3">
        <h3 className="truncate text-base font-bold text-foreground">{deck.title}</h3>
      </div>

      <div className="space-y-3 p-4">
        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">{deck.description || 'No description'}</p>

        <TrashActions isPending={isPending} onRestore={onRestore} onDelete={onDelete} restoreLabel="Restore" />
      </div>
    </article>
  );
}

function CardTrashItem({
  card,
  isPending,
  onRestore,
  onDelete,
}: {
  card: ApiCard;
  isPending: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="trash-card group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-muted-foreground/20 hover:shadow-md">
      {/* Left accent bar — visible on hover */}
      <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full bg-transparent transition-colors duration-150 group-hover:bg-primary" />

      <div className="space-y-2.5 p-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/25 p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Prompt</p>
            <MarkdownPreview value={card.promptRichText} className="line-clamp-4 text-sm" />
          </div>
          <div className="rounded-lg border bg-muted/25 p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Answer</p>
            <MarkdownPreview value={card.answerRichText} className="line-clamp-4 text-sm" />
          </div>
        </div>

        <TrashActions isPending={isPending} onRestore={onRestore} onDelete={onDelete} restoreLabel="Restore" />
      </div>
    </article>
  );
}

// ─── Shared Actions ──────────────────────────────────────────────────────────

function TrashActions({
  isPending,
  onRestore,
  onDelete,
  restoreLabel,
}: {
  isPending: boolean;
  onRestore: () => void;
  onDelete: () => void;
  restoreLabel: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs font-semibold"
        disabled={isPending}
        onClick={onRestore}
      >
        {isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        {restoreLabel}
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs font-semibold"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  );
}

// ─── Empty Section ───────────────────────────────────────────────────────────

function EmptySection({ icon: Icon, title, description }: { icon: typeof Trash2; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card/40 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function TrashLoading() {
  return (
    <div className="space-y-8">
      {[{ icon: CheckSquare2 }, { icon: Layers3 }, { icon: ArchiveRestore }].map((section, i) => (
        <section key={i} className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-[148px] rounded-xl" />
            <Skeleton className="h-[148px] rounded-xl" />
          </div>
        </section>
      ))}
    </div>
  );
}
