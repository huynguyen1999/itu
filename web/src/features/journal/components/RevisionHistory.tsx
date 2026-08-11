import { useState } from 'react';
import { Eye, History, RotateCcw, X } from 'lucide-react';
import { useJournalRevisions } from '../journalQueries';
import { useRestoreJournalRevisionMutation } from '../journalMutations';
import type { JournalEntryRevision } from '../journal.types';
import { Button } from '@/shared/ui/button';

interface RevisionHistoryProps {
  entryId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RevisionHistory({ entryId, isOpen, onClose }: RevisionHistoryProps) {
  const { data: revisions = [], isLoading, isError, refetch } = useJournalRevisions(entryId);
  const restoreMutation = useRestoreJournalRevisionMutation();
  const [selectedRevision, setSelectedRevision] = useState<JournalEntryRevision | null>(null);

  if (!isOpen) return null;

  const handleRestore = async (revision: JournalEntryRevision) => {
    try {
      await restoreMutation.mutateAsync({ entryId, revisionId: revision.id, snapshot: revision.snapshot });
      onClose();
    } catch {
      // Mutation state is rendered in the panel so the user can retry.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-foreground/60 backdrop-blur-sm sm:items-stretch"
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col space-y-4 overflow-hidden rounded-t-[var(--itu-radius-l)] border border-border bg-card p-4 text-card-foreground shadow-[var(--itu-shadow-pop)] sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-[var(--itu-radius-l)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-revision-history-title"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 font-semibold">
            <History className="h-4 w-4 text-primary" />
            <h2 id="journal-revision-history-title">Version History</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close version history">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="py-4 text-sm text-muted-foreground" role="status">
            Loading revision history…
          </div>
        ) : isError ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--itu-radius-m)] border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive"
            role="alert"
          >
            <span>Revision history could not be loaded.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : revisions.length === 0 ? (
          <div className="rounded-[var(--itu-radius-m)] border border-dashed border-border p-4 text-sm text-muted-foreground">
            No historical revisions recorded yet.
          </div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {revisions.map((revision) => {
              const dateStr = new Date(revision.createdAt).toLocaleString();
              const title = typeof revision.snapshot.title === 'string' ? revision.snapshot.title : 'Untitled';
              const content =
                typeof revision.snapshot.contentMarkdown === 'string' ? revision.snapshot.contentMarkdown : '';
              const isPreviewing = selectedRevision?.id === revision.id;

              return (
                <div
                  key={revision.id}
                  className={`rounded-[var(--itu-radius-m)] border p-3 transition-colors ${
                    isPreviewing ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/45'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-foreground">Revision #{revision.revisionNumber}</span>
                    <span className="text-[11px] text-muted-foreground">{dateStr}</span>
                  </div>

                  <div className="mb-2 line-clamp-2 rounded-[var(--itu-radius-s)] border border-[var(--itu-border-soft)] bg-muted/40 p-1.5 font-mono text-xs text-muted-foreground">
                    {title} — {content.substring(0, 100) || 'No text'}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedRevision(isPreviewing ? null : revision)}
                      className="gap-1"
                    >
                      <Eye className="h-3 w-3" />
                      {isPreviewing ? 'Hide preview' : 'Preview'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleRestore(revision)}
                      disabled={restoreMutation.isPending}
                      className="gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {restoreMutation.isPending ? 'Restoring…' : 'Restore'}
                    </Button>
                  </div>

                  {isPreviewing && (
                    <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                      <div className="font-semibold text-primary">{title}</div>
                      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-[var(--itu-radius-s)] border border-border bg-muted/40 p-2 font-mono text-[11px] text-foreground">
                        {content || 'No text'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {restoreMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            The revision could not be restored. Try again.
          </p>
        )}
      </div>
    </div>
  );
}
