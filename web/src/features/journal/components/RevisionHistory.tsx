import { useState } from 'react';
import { History, RotateCcw, X, Eye } from 'lucide-react';
import { useJournalRevisions } from '../journalQueries';
import { useRestoreJournalRevisionMutation } from '../journalMutations';
import type { JournalEntryRevision } from '../journal.types';

interface RevisionHistoryProps {
  entryId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RevisionHistory({ entryId, isOpen, onClose }: RevisionHistoryProps) {
  const { data: revisions = [], isLoading } = useJournalRevisions(entryId);
  const restoreMutation = useRestoreJournalRevisionMutation();
  const [selectedRevision, setSelectedRevision] = useState<JournalEntryRevision | null>(null);

  if (!isOpen) return null;

  const handleRestore = async (revision: JournalEntryRevision) => {
    try {
      await restoreMutation.mutateAsync({ entryId, revisionId: revision.id, snapshot: revision.snapshot });
      onClose();
    } catch (err) {
      console.error('Failed to restore revision', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
      <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 p-4 flex flex-col space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <History className="w-4 h-4 text-emerald-400" />
            Version History
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="text-xs text-slate-400 py-4">Loading revision history...</div>
        ) : revisions.length === 0 ? (
          <div className="text-xs text-slate-400 py-4">No historical revisions recorded yet.</div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {revisions.map((rev) => {
              const dateStr = new Date(rev.createdAt).toLocaleString();
              const snapshot = rev.snapshot as any;
              const isPreviewing = selectedRevision?.id === rev.id;

              return (
                <div
                  key={rev.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isPreviewing
                      ? 'bg-slate-800/80 border-emerald-500/50'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-200">Revision #{rev.revisionNumber}</span>
                    <span className="text-[10px] text-slate-400">{dateStr}</span>
                  </div>

                  <div className="text-xs text-slate-400 line-clamp-2 mb-2 font-mono bg-slate-900/80 p-1.5 rounded-lg border border-slate-800/60">
                    {snapshot.title || 'Untitled'} — {snapshot.contentMarkdown?.substring(0, 100) || 'No text'}
                  </div>

                  <div className="flex items-center justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedRevision(isPreviewing ? null : rev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      {isPreviewing ? 'Hide preview' : 'Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRestore(rev)}
                      disabled={restoreMutation.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>

                  {isPreviewing && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-1 text-xs text-slate-300">
                      <div className="font-semibold text-emerald-400">{snapshot.title}</div>
                      <div className="prose prose-invert prose-xs whitespace-pre-wrap font-mono text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800">
                        {snapshot.contentMarkdown}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
