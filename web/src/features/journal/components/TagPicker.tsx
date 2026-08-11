import { useState } from 'react';
import { Plus, Tag as TagIcon, X } from 'lucide-react';
import { useJournalTags } from '../journalQueries';
import { useCreateJournalTagMutation } from '../journalMutations';
import { Button } from '@/shared/ui/button';

interface TagPickerProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagPicker({ selectedTagIds, onChange }: TagPickerProps) {
  const { data: tags = [], isLoading, isError, refetch } = useJournalTags();
  const createTag = useCreateJournalTagMutation();
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const created = await createTag.mutateAsync({ name: newTagName });
      onChange([...selectedTagIds, created.id]);
      setNewTagName('');
    } catch {
      // The mutation error is rendered next to the create control.
    }
  };

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1.5 text-xs">
      {selectedTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-primary"
        >
          <TagIcon className="h-3 w-3" />
          {tag.name}
          <button
            type="button"
            onClick={() => toggleTag(tag.id)}
            className="rounded-full text-primary/75 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Remove tag ${tag.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen((open) => !open)}
        className="h-8 gap-1 rounded-full px-2.5"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Plus className="h-3 w-3" />
        Tag
      </Button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 space-y-2 rounded-[var(--itu-radius-m)] border border-border bg-popover p-3 text-popover-foreground shadow-[var(--itu-shadow-pop)]">
          <div className="text-[11px] font-semibold text-muted-foreground">Select or create tags</div>

          {isError ? (
            <div
              className="space-y-2 rounded-[var(--itu-radius-s)] bg-destructive/10 p-2 text-xs text-destructive"
              role="alert"
            >
              <p>Tags could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : isLoading ? (
            <div className="py-2 text-xs text-muted-foreground" role="status">
              Loading tags…
            </div>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto" role="listbox" aria-label="Journal tags">
              {tags.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No tags yet.</p>
              ) : (
                tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`flex min-h-9 w-full items-center justify-between rounded-[var(--itu-radius-s)] px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
                      }`}
                      role="option"
                      aria-selected={selected}
                    >
                      <span>#{tag.name}</span>
                      {selected && <span aria-hidden="true">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <div className="flex gap-1 border-t border-border pt-2">
            <label className="sr-only" htmlFor="new-journal-tag">
              New tag name
            </label>
            <input
              id="new-journal-tag"
              type="text"
              placeholder="New tag..."
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateTag();
                }
              }}
              className="h-9 min-w-0 flex-1 rounded-[var(--itu-radius-s)] border border-input bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 px-2"
              onClick={() => void handleCreateTag()}
              disabled={!newTagName.trim() || createTag.isPending}
            >
              {createTag.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
          {createTag.isError && (
            <p className="text-xs text-destructive" role="alert">
              Tag could not be created. Try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
