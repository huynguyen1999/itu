import { useEffect, useState } from 'react';
import { LayoutTemplate, Plus, Trash2, X } from 'lucide-react';
import { useJournalTemplates } from '../journalQueries';
import { useCreateJournalTemplateMutation, useDeleteJournalTemplateMutation } from '../journalMutations';
import type { JournalEntryKind } from '../journal.types';

interface TemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (template: any) => void;
}

export function TemplateEditor({ isOpen, onClose, onSelectTemplate }: TemplateEditorProps) {
  const { data: templates = [] } = useJournalTemplates();
  const createMutation = useCreateJournalTemplateMutation();
  const deleteMutation = useDeleteJournalTemplateMutation();

  const [name, setName] = useState('');
  const [entryKind, setEntryKind] = useState<JournalEntryKind>('NOTE');
  const [titleTemplate, setTitleTemplate] = useState('{{date}}');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        entryKind,
        titleTemplate: titleTemplate.trim(),
        bodyMarkdown: bodyMarkdown.trim(),
      });
      setName('');
      setBodyMarkdown('');
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create template', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete template', err);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-semibold text-slate-200 text-sm">
            <LayoutTemplate className="w-4 h-4 text-emerald-400" />
            Journal Templates
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {!isCreating && (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full p-2.5 rounded-xl border border-dashed border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/50 text-slate-300 transition-colors flex items-center justify-center gap-1.5 font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Custom Template
            </button>
          )}

          {isCreating && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="font-semibold text-slate-200">New Template</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Morning Planning"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Entry Kind</label>
                  <select
                    value={entryKind}
                    onChange={(e) => setEntryKind(e.target.value as JournalEntryKind)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="NOTE">NOTE</option>
                    <option value="WEEKLY_REVIEW">WEEKLY_REVIEW</option>
                    <option value="EXPENSE">EXPENSE</option>
                    <option value="WORKOUT">WORKOUT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Title Template</label>
                <input
                  type="text"
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  placeholder="{{date}} or Weekly Review"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Body Markdown</label>
                <textarea
                  rows={4}
                  value={bodyMarkdown}
                  onChange={(e) => setBodyMarkdown(e.target.value)}
                  placeholder="## Prompt questions..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                >
                  Save Template
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-200 flex items-center gap-2">
                    {tpl.name}
                    {tpl.builtIn && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400 font-normal">
                        Built-in
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {tpl.entryKind} • {tpl.titleTemplate}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onSelectTemplate && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTemplate(tpl);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-medium transition-colors"
                    >
                      Use
                    </button>
                  )}
                  {!tpl.builtIn && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(tpl.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
