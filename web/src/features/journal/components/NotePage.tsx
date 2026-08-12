import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, LayoutTemplate, MoreHorizontal, PanelRight, Trash2 } from 'lucide-react';
import { useJournalEntry } from '../journalQueries';
import {
  useCreateJournalEntryMutation,
  useUpdateJournalEntryMutation,
  useDeleteJournalEntryMutation,
} from '../journalMutations';
import { TagPicker } from './TagPicker';
import { AttachmentTray } from './AttachmentTray';
import { TemplateEditor } from './TemplateEditor';
import { NoteInspector } from './NoteInspector';
import { JournalMarkdownEditor, SaveStatus } from './JournalMarkdownEditor';
import { Button } from '@/shared/ui/button';
import { createUlid } from '@/shared/sync/syncIdentity';
import type { JournalEntry } from '../journal.types';
import { getLocalTodayDateString } from '../journalDate';
import { PageHeader } from '@/shared/ui/PageHeader';

interface NotePageProps {
  isDaily?: boolean;
}

export function NotePage({ isDaily = false }: NotePageProps) {
  const navigate = useNavigate();
  const { entryId, date } = useParams();
  const [searchParams] = useSearchParams();

  const isNew = !entryId && !date;
  const initialDate = date || searchParams.get('date') || getLocalTodayDateString();

  const { data: existingEntry, isLoading } = useJournalEntry(entryId || '', isNew || Boolean(date));

  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const deleteMutation = useDeleteJournalEntryMutation();

  const [id, setId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [entryDate, setEntryDate] = useState(initialDate);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const [showInspector, setShowInspector] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const activeEntryRef = useRef<Partial<JournalEntry> | null>(null);

  useEffect(() => {
    if (existingEntry) {
      setId(existingEntry.id);
      setTitle(existingEntry.title);
      setContentMarkdown(existingEntry.contentMarkdown || '');
      setEntryDate(
        existingEntry.entryDate ? existingEntry.entryDate.slice(0, 10) : initialDate,
      );
      setSelectedTagIds(existingEntry.tags?.map((t) => t.id) || []);
      activeEntryRef.current = existingEntry;
    } else if (isNew || date) {
      const newId = createUlid();
      setId(newId);
      setTitle(isDaily ? `Daily Note — ${entryDate}` : '');
      setContentMarkdown('');
      setSelectedTagIds([]);
      activeEntryRef.current = null;
    }
  }, [existingEntry, isNew, date, isDaily, entryDate, initialDate]);

  const handleAutosave = async (newContent?: string, newTitle?: string, newTags?: string[], newDate?: string) => {
    const currentTitle = (newTitle !== undefined ? newTitle : title).trim();
    if (!currentTitle) return;

    const targetContent = newContent !== undefined ? newContent : contentMarkdown;
    const targetTags = newTags !== undefined ? newTags : selectedTagIds;
    const targetDate = newDate !== undefined ? newDate : entryDate;

    setSaveStatus('syncing');

    try {
      if (activeEntryRef.current?.id || entryId) {
        await updateMutation.mutateAsync({
          id: id || entryId!,
          title: currentTitle,
          contentMarkdown: targetContent,
          entryDate: targetDate,
          tagIds: targetTags,
        });
      } else {
        const created = (await createMutation.mutateAsync({
          id,
          kind: isDaily ? 'NOTE' : 'NOTE',
          title: currentTitle,
          contentMarkdown: targetContent,
          entryDate: targetDate,
          tagIds: targetTags,
        })) as any;
        activeEntryRef.current = created;
      }
      setSaveStatus('synced');
      setTimeout(() => setSaveStatus('saved'), 2000);
    } catch {
      setSaveStatus('conflict');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this note?')) {
      await deleteMutation.mutateAsync({ id });
      navigate(isDaily ? '/journal/daily' : '/journal/notes');
    }
  };

  const applyTemplate = (template: any) => {
    if (template.titleTemplate) {
      const updatedTitle = template.titleTemplate.replace('{{date}}', entryDate);
      setTitle(updatedTitle);
      void handleAutosave(undefined, updatedTitle);
    }
    if (template.bodyMarkdown) {
      setContentMarkdown(template.bodyMarkdown);
      void handleAutosave(template.bodyMarkdown);
    }
    setShowTemplates(false);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading note...</div>;
  }

  const currentEntryObj: JournalEntry = (existingEntry || {
    id: id || 'temp-id',
    userId: 'local',
    kind: 'NOTE',
    title: title || 'Untitled',
    contentMarkdown,
    entryDate,
    timezone: 'UTC',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    attachments: [],
  }) as JournalEntry;

  return (
    <div className="itu-page-canvas flex h-full min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      {/* Main Document Workspace */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <PageHeader
          kicker={isDaily ? 'Daily writing' : 'Journal'}
          title={isDaily ? 'Daily note' : 'Note'}
          description={entryDate}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--itu-radius-s)] px-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--itu-teal-400)] focus-visible:ring-offset-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <button
              type="button"
              onClick={() => setShowInspector(!showInspector)}
              aria-label={showInspector ? 'Hide note inspector' : 'Show note inspector'}
              aria-expanded={showInspector}
              aria-controls="note-inspector"
              className={`rounded-[var(--itu-radius-s)] border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                showInspector
                ? 'border-[var(--itu-teal-400)]/60 bg-white/15 text-[var(--itu-teal-400)]'
                  : 'border-white/20 text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Toggle Inspector"
            >
              <PanelRight className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                aria-label="Open note actions"
                aria-expanded={showMenu}
                aria-haspopup="menu"
                className="rounded-[var(--itu-radius-s)] border border-white/20 p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--itu-teal-400)] focus-visible:ring-offset-0"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showMenu && (
                <div
                  className="absolute right-0 z-30 mt-1 w-44 rounded-[var(--itu-radius-m)] border border-border bg-card p-1.5 text-xs shadow-lg"
                  role="menu"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowTemplates(true);
                      setShowMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-[var(--itu-radius-s)] px-2.5 py-1.5 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    role="menuitem"
                  >
                    <LayoutTemplate className="w-3.5 h-3.5" />
                    Templates
                  </button>
                  {id && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete();
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-[var(--itu-radius-s)] px-2.5 py-1.5 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      role="menuitem"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Note
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </PageHeader>

        {/* Document Canvas (No Card Soup!) */}
        <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
          {/* Frameless Header: Title, Date & Tags */}
          <div className="space-y-3 border-b border-border/30 pb-4">
            <input
              type="text"
              placeholder={isDaily ? 'Daily Note Title...' : 'Note Title...'}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                void handleAutosave(undefined, e.target.value);
              }}
              className="w-full bg-transparent text-3xl font-extrabold tracking-tight text-foreground placeholder:text-muted-foreground/40 border-none outline-none"
            />

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 rounded-[var(--itu-radius-s)] border border-border/40 bg-muted/40 px-2.5 py-1">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => {
                    setEntryDate(e.target.value);
                    void handleAutosave(undefined, undefined, undefined, e.target.value);
                  }}
                  className="bg-transparent text-foreground outline-none text-xs"
                />
              </div>

              <TagPicker
                selectedTagIds={selectedTagIds}
                onChange={(tags) => {
                  setSelectedTagIds(tags);
                  void handleAutosave(undefined, undefined, tags);
                }}
              />
            </div>
          </div>

          {/* CodeMirror 6 Editor Canvas */}
          <JournalMarkdownEditor
            value={contentMarkdown}
            onChange={(val) => {
              setContentMarkdown(val);
              void handleAutosave(val);
            }}
            saveStatus={saveStatus}
            placeholder="Start typing your note (supports Markdown & [[Links]])..."
            minHeight="420px"
          />

          {/* Attachments Section */}
          {id && existingEntry && (
            <div className="pt-6 border-t border-border/40">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Attachments</h4>
              <AttachmentTray entryId={id} attachments={existingEntry.attachments} />
            </div>
          )}
        </main>
      </div>

      {/* Collapsible Inspector Sidebar */}
      {showInspector && <NoteInspector entry={currentEntryObj} onClose={() => setShowInspector(false)} />}

      {/* Template Selection Dialog */}
      <TemplateEditor isOpen={showTemplates} onClose={() => setShowTemplates(false)} onSelectTemplate={applyTemplate} />
    </div>
  );
}
