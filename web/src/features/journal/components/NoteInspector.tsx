import { useState } from 'react';
import { AlignLeft, Clock, History, Sliders, X } from 'lucide-react';
import type { JournalEntry, JournalEntryRevision } from '../journal.types';
import { useJournalRevisions } from '../journalQueries';
import { useRestoreJournalRevisionMutation } from '../journalMutations';

interface NoteInspectorProps {
  entry: JournalEntry;
  onClose?: () => void;
  onSelectHeading?: (lineIndex: number) => void;
}

export function NoteInspector({ entry, onClose, onSelectHeading }: NoteInspectorProps) {
  const [activeTab, setActiveTab] = useState<'outline' | 'properties' | 'revisions'>('outline');
  const { data: revisions = [] } = useJournalRevisions(entry.id);
  const restoreRevisionMutation = useRestoreJournalRevisionMutation();

  // Extract headings from Markdown for Outline
  const headings = (entry.contentMarkdown || '')
    .split('\n')
    .map((line, idx) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return null;
      return {
        level: match[1].length,
        text: match[2].trim(),
        line: idx,
      };
    })
    .filter(Boolean) as { level: number; text: string; line: number }[];

  const handleRestore = async (revision: JournalEntryRevision) => {
    if (confirm(`Restore revision #${revision.revisionNumber}?`)) {
      await restoreRevisionMutation.mutateAsync({
        entryId: entry.id,
        revisionId: revision.id,
        snapshot: revision.snapshot,
      });
    }
  };

  return (
    <aside
      id="note-inspector"
      className="order-last flex h-auto max-h-[45vh] w-full shrink-0 flex-col overflow-hidden border-t border-border bg-card/60 text-xs lg:order-none lg:h-full lg:max-h-none lg:w-72 lg:border-l lg:border-t-0"
    >
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="Note inspector sections">
          <button
            type="button"
            onClick={() => setActiveTab('outline')}
            aria-label="Show outline"
            aria-selected={activeTab === 'outline'}
            aria-controls="note-inspector-outline"
            id="note-inspector-tab-outline"
            role="tab"
            className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--itu-radius-s)] p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === 'outline'
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('properties')}
            aria-label="Show properties"
            aria-selected={activeTab === 'properties'}
            aria-controls="note-inspector-properties"
            id="note-inspector-tab-properties"
            role="tab"
            className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--itu-radius-s)] p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === 'properties'
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('revisions')}
            aria-label="Show revision history"
            aria-selected={activeTab === 'revisions'}
            aria-controls="note-inspector-revisions"
            id="note-inspector-tab-revisions"
            role="tab"
            className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--itu-radius-s)] p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === 'revisions'
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-4 h-4" />
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close note inspector"
            className="rounded-[var(--itu-radius-s)] p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {activeTab === 'outline' && (
          <div id="note-inspector-outline" role="tabpanel" aria-labelledby="note-inspector-tab-outline">
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-2 text-muted-foreground">
              Outline
            </h4>
            {headings.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">No headings in document</p>
            ) : (
              <ul className="space-y-1">
                {headings.map((h, i) => (
                  <li key={i} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                    <button
                      type="button"
                      onClick={() => onSelectHeading?.(h.line)}
                      className="w-full truncate py-1 text-left text-xs text-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'properties' && (
          <div
            id="note-inspector-properties"
            role="tabpanel"
            aria-labelledby="note-inspector-tab-properties"
            className="space-y-2.5"
          >
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-2 text-muted-foreground">
              Properties
            </h4>
            <div className="grid grid-cols-2 gap-1.5 text-xs py-1 border-b border-border/40">
              <span className="text-muted-foreground">Kind</span>
              <span className="font-mono text-foreground font-medium">{entry.kind}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs py-1 border-b border-border/40">
              <span className="text-muted-foreground">Created</span>
              <span className="text-foreground">{new Date(entry.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs py-1 border-b border-border/40">
              <span className="text-muted-foreground">Updated</span>
              <span className="text-foreground">
                {new Date(entry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs py-1 border-b border-border/40">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-foreground">{entry.version}</span>
            </div>
          </div>
        )}

        {activeTab === 'revisions' && (
          <div id="note-inspector-revisions" role="tabpanel" aria-labelledby="note-inspector-tab-revisions">
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-2 text-muted-foreground">
              Revisions ({revisions.length})
            </h4>
            {revisions.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">No revisions recorded yet</p>
            ) : (
              <div className="space-y-2">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--itu-radius-s)] border border-border/60 bg-background/50 p-2"
                  >
                    <div>
                      <p className="font-medium text-foreground text-xs">Revision #{rev.revisionNumber}</p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(rev.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestore(rev)}
                      className="rounded-[var(--itu-radius-s)] border border-input bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
