import { RotateCcw, Trash2 } from 'lucide-react';
import { useJournalEntries } from './journalQueries';
import { useRestoreJournalEntryMutation } from './journalMutations';
import { formatDateStringToLocalDisplay } from './journalDate';

export function JournalTrashPage() {
  const { data: entries = [], isLoading, isError } = useJournalEntries({ includeDeleted: true });
  const restoreMutation = useRestoreJournalEntryMutation();
  const deletedEntries = entries.filter((entry) => Boolean(entry.deletedAt));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-start gap-3 border-b border-border/60 pb-5">
        <Trash2 className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Journal Trash</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deleted pages stay here until you restore them.</p>
        </div>
      </header>

      {isLoading ? (
        <div role="status" className="rounded-[var(--itu-radius-m)] border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading trash…
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-[var(--itu-radius-m)] border border-border bg-card p-6 text-sm text-muted-foreground">
          Journal Trash could not be loaded.
        </div>
      ) : deletedEntries.length === 0 ? (
        <div className="rounded-[var(--itu-radius-m)] border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Trash is empty.
        </div>
      ) : (
        <div className="space-y-3">
          {deletedEntries.map((entry) => (
            <article key={entry.id} className="flex items-center justify-between gap-4 rounded-[var(--itu-radius-m)] border border-border bg-card p-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">{entry.title || 'Untitled entry'}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.kind.replace('_', ' ')} · Deleted {entry.deletedAt ? formatDateStringToLocalDisplay(entry.deletedAt.slice(0, 10)) : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void restoreMutation.mutateAsync(entry.id)}
                disabled={restoreMutation.isPending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--itu-radius-s)] border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Restore
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
