import { useState } from 'react';
import { AlignLeft, Clock, History, Link as LinkIcon, Sliders, X } from 'lucide-react';
import type { JournalEntry, JournalEntryRevision } from '../journal.types';
import { useJournalRevisions } from '../journalQueries';
import { useRestoreJournalRevisionMutation } from '../journalMutations';

interface NoteInspectorProps {
  entry: JournalEntry;
  onClose?: () => void;
  onSelectHeading?: (lineIndex: number) => void;
}

export function NoteInspector({ entry, onClose, onSelectHeading }: NoteInspectorProps) {
  const [activeTab, setActiveTab] = useState<'outline' | 'backlinks' | 'properties' | 'revisions'>('outline');
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
      await restoreRevisionMutation.mutateAsync({ entryId: entry.id, revisionId: revision.id });
    }
  };

  return (
    <aside className="w-72 border-l border-border bg-card/60 flex flex-col h-full text-xs">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-muted/20">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('outline')}
            title="Outline"
            className={`p-1.5 rounded-md transition-colors ${
              activeTab === 'outline' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backlinks')}
            title="Backlinks"
            className={`p-1.5 rounded-md transition-colors ${
              activeTab === 'backlinks' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('properties')}
            title="Properties"
            className={`p-1.5 rounded-md transition-colors ${
              activeTab === 'properties' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('revisions')}
            title="Revision History"
            className={`p-1.5 rounded-md transition-colors ${
              activeTab === 'revisions' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-4 h-4" />
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="p-3 flex-1 overflow-y-auto space-y-3">
        {activeTab === 'outline' && (
          <div>
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
                      className="text-left w-full truncate text-xs text-foreground/80 hover:text-primary transition-colors py-0.5"
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'backlinks' && (
          <div>
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-2 text-muted-foreground">
              Backlinks
            </h4>
            <p className="text-muted-foreground text-xs italic">0 references to this note</p>
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="space-y-2.5">
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-2 text-muted-foreground">
              Properties
            </h4>
            <div className="grid grid-cols-2 gap-1.5 text-xs py-1 border-b border-border/40">
              <span className="text-muted-foreground">Kind</span>
              <span className="font-mono text-foreground font-medium">{entry.kind}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs py-1 border-b border-border/40">
              <span className="text-muted-foreground">Created</span>
              <span className="text-foreground">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
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
          <div>
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
                    className="p-2 rounded-lg border border-border/60 bg-background/50 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium text-foreground text-xs">
                        Revision #{rev.revisionNumber}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(rev.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestore(rev)}
                      className="px-2 py-1 text-[10px] font-medium rounded border border-input bg-background hover:bg-muted text-foreground"
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
