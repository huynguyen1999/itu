import { useEffect, useState } from 'react';
import { LayoutTemplate, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useJournalTemplates } from '../journalQueries';
import {
  useCreateJournalTemplateMutation,
  useDeleteJournalTemplateMutation,
  useUpdateJournalTemplateMutation,
} from '../journalMutations';
import type { JournalEntryKind, JournalTemplate } from '../journal.types';
import { Button } from '@/shared/ui/button';

interface TemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (template: JournalTemplate) => void;
}

export function TemplateEditor({ isOpen, onClose, onSelectTemplate }: TemplateEditorProps) {
  const { data: templates = [], isLoading, isError, refetch } = useJournalTemplates();
  const createMutation = useCreateJournalTemplateMutation();
  const updateMutation = useUpdateJournalTemplateMutation();
  const deleteMutation = useDeleteJournalTemplateMutation();

  const [name, setName] = useState('');
  const [entryKind, setEntryKind] = useState<JournalEntryKind>('NOTE');
  const [titleTemplate, setTitleTemplate] = useState('{{date}}');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setEntryKind('NOTE');
    setTitleTemplate('{{date}}');
    setBodyMarkdown('');
    setIsCreating(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          name: name.trim(),
          entryKind,
          titleTemplate: titleTemplate.trim(),
          bodyMarkdown: bodyMarkdown.trim(),
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          entryKind,
          titleTemplate: titleTemplate.trim(),
          bodyMarkdown: bodyMarkdown.trim(),
        });
      }
      resetForm();
    } catch {
      // Mutation errors remain visible below so the user can retry without losing the form.
    }
  };

  const startCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const startEdit = (template: JournalTemplate) => {
    setEditingId(template.id);
    setIsCreating(false);
    setName(template.name);
    setEntryKind(template.entryKind);
    setTitleTemplate(template.titleTemplate);
    setBodyMarkdown(template.bodyMarkdown);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch {
      // The mutation state communicates the failure and keeps the template available for another attempt.
    }
  };

  const mutationError = createMutation.isError || updateMutation.isError || deleteMutation.isError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col space-y-4 overflow-hidden rounded-[var(--itu-radius-l)] border border-border bg-card p-5 text-card-foreground shadow-[var(--itu-shadow-pop)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-templates-title"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            <h2 id="journal-templates-title">Journal Templates</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close templates">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-xs">
          {!isCreating && (
            <Button type="button" variant="outline" onClick={startCreate} className="w-full gap-1.5 border-dashed">
              <Plus className="h-4 w-4" />
              Create Custom Template
            </Button>
          )}

          {(isCreating || editingId) && (
            <div className="space-y-3 rounded-[var(--itu-radius-m)] border border-border bg-muted/35 p-3.5">
              <div className="font-semibold text-foreground">{editingId ? 'Edit Template' : 'New Template'}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-muted-foreground">Template Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Morning Planning"
                    className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-muted-foreground">Entry Kind</span>
                  <select
                    value={entryKind}
                    onChange={(event) => setEntryKind(event.target.value as JournalEntryKind)}
                    className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="NOTE">NOTE</option>
                    <option value="WEEKLY_REVIEW">WEEKLY REVIEW</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="block text-muted-foreground">Title Template</span>
                <input
                  type="text"
                  value={titleTemplate}
                  onChange={(event) => setTitleTemplate(event.target.value)}
                  placeholder="{{date}} or Weekly Review"
                  className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="block space-y-1">
                <span className="block text-muted-foreground">Body Markdown</span>
                <textarea
                  rows={4}
                  value={bodyMarkdown}
                  onChange={(event) => setBodyMarkdown(event.target.value)}
                  placeholder="## Prompt questions..."
                  className="w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving…'
                    : editingId
                      ? 'Save Changes'
                      : 'Save Template'}
                </Button>
              </div>
            </div>
          )}

          {isError ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--itu-radius-m)] border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive"
              role="alert"
            >
              <span>Templates could not be loaded.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : isLoading ? (
            <div
              className="rounded-[var(--itu-radius-m)] border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
              role="status"
            >
              Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-[var(--itu-radius-m)] border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              No templates yet. Create one to start with a repeatable prompt.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--itu-radius-m)] border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <span className="truncate">{template.name}</span>
                      {template.builtIn && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                          Built-in
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {template.entryKind} · {template.titleTemplate}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {onSelectTemplate && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onSelectTemplate(template);
                          onClose();
                        }}
                      >
                        Use
                      </Button>
                    )}
                    {!template.builtIn && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(template)}
                        aria-label={`Edit ${template.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!template.builtIn && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(template.id)}
                        aria-label={`Delete ${template.name}`}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {mutationError && (
            <p className="text-sm text-destructive" role="alert">
              The template could not be saved or deleted. Try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
