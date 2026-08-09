import { useState } from 'react';
import { Plus, Tag as TagIcon, X } from 'lucide-react';
import { useJournalTags } from '../journalQueries';
import { useCreateJournalTagMutation } from '../journalMutations';

interface TagPickerProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagPicker({ selectedTagIds, onChange }: TagPickerProps) {
  const { data: tags = [] } = useJournalTags();
  const createTag = useCreateJournalTagMutation();
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const created = await createTag.mutateAsync({ name: newTagName });
      onChange([...selectedTagIds, created.id]);
      setNewTagName('');
    } catch (err) {
      console.error('Failed to create tag', err);
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
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
        >
          <TagIcon className="w-3 h-3" />
          {tag.name}
          <button
            type="button"
            onClick={() => toggleTag(tag.id)}
            className="hover:text-emerald-200 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
      >
        <Plus className="w-3 h-3" />
        Tag
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 p-2 rounded-xl bg-slate-900 border border-slate-800 shadow-xl space-y-2">
          <div className="text-[11px] font-medium text-slate-400">Select or create tags</div>
          <div className="max-h-36 overflow-y-auto space-y-1">
            {tags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`w-full text-left px-2 py-1 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    selected
                      ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span>#{tag.name}</span>
                  {selected && <span className="text-emerald-400">✓</span>}
                </button>
              );
            })}
          </div>

          <div className="flex gap-1 pt-1 border-t border-slate-800">
            <input
              type="text"
              placeholder="New tag..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateTag();
                }
              }}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleCreateTag}
              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
