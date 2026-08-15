import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Calendar, LayoutTemplate, MoreHorizontal, Trash2 } from 'lucide-react';
import { useJournalEntries, useJournalEntry, useJournalTags } from '../journalQueries';
import {
  useCreateJournalEntryMutation,
  useUpdateJournalEntryMutation,
  useDeleteJournalEntryMutation,
} from '../journalMutations';
import { TagPicker } from './TagPicker';
import { AttachmentTray } from './AttachmentTray';
import { TemplateEditor } from './TemplateEditor';
import { JournalMarkdownEditor, SaveStatus } from './JournalMarkdownEditor';
import { createUlid } from '@/shared/sync/syncIdentity';
import type { JournalEntry } from '../journal.types';
import {
  getLocalTodayDateString,
  formatDateSlash,
  formatDayOfWeek,
  calculateDailyStreak,
} from '../journalDate';
import { DailyStreakBadge } from './DailyStreakBadge';
import { PageHeader } from '@/shared/ui/PageHeader';

interface NotePageProps {
  isDaily?: boolean;
}

const DAILY_PROMPTS = [
  "What's one thing you avoided today, and why?",
  "What would make today feel truly accomplished?",
  "What is top of mind as you begin this session?",
  "What is one small win or breakthrough from yesterday?",
  "What friction point are you ready to clear away?",
  "What does deep focus look like for the next 2 hours?",
  "What are you most excited to learn or create today?",
];

export function NotePage({ isDaily = false }: NotePageProps) {
  const navigate = useNavigate();
  const { entryId, date } = useParams();
  const [searchParams] = useSearchParams();

  const isNew = !entryId && !date;
  const initialDate = date || searchParams.get('date') || getLocalTodayDateString();

  const { data: existingEntry, isLoading } = useJournalEntry(entryId || '', isNew || Boolean(date));
  const { data: allNotes = [] } = useJournalEntries({ kind: 'NOTE' });
  const { data: tags = [] } = useJournalTags();

  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const deleteMutation = useDeleteJournalEntryMutation();

  const [id, setId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [entryDate, setEntryDate] = useState(initialDate);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  const [editorMode, setEditorMode] = useState<'write' | 'preview' | 'source'>('write');
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
      if (existingEntry.updatedAt) {
        const d = new Date(existingEntry.updatedAt);
        setLastSavedTime(
          d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        );
      }
    } else if (isNew || date) {
      const newId = createUlid();
      setId(newId);
      setTitle(isDaily ? 'Daily note' : '');
      setContentMarkdown('');
      setSelectedTagIds([]);
      activeEntryRef.current = null;
      setLastSavedTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
    }
  }, [existingEntry, isNew, date, isDaily, entryDate, initialDate]);

  const handleAutosave = async (
    newContent?: string,
    newTitle?: string,
    newTags?: string[],
    newDate?: string,
  ) => {
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
          kind: 'NOTE',
          title: currentTitle,
          contentMarkdown: targetContent,
          entryDate: targetDate,
          tagIds: targetTags,
        })) as any;
        activeEntryRef.current = created;
      }
      setSaveStatus('synced');
      setLastSavedTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
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

  // Dynamic daily prompt based on day of month
  const dayIndex = useMemo(() => {
    const d = new Date(entryDate);
    return isNaN(d.getTime()) ? 0 : d.getDate() % DAILY_PROMPTS.length;
  }, [entryDate]);
  const promptText = DAILY_PROMPTS[dayIndex];

  // Headings outline extracted from markdown
  const headings = useMemo(() => {
    return (contentMarkdown || '')
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
  }, [contentMarkdown]);

  // Linked notes extracted from [[wikilinks]]
  const linkedNotes = useMemo(() => {
    const matches = Array.from(contentMarkdown.matchAll(/\[\[(.*?)\]\]/g));
    return Array.from(new Set(matches.map((m) => m[1].trim()))).filter(Boolean);
  }, [contentMarkdown]);

  // Daily Streak calculation
  const streakCount = useMemo(() => {
    const noteDates = allNotes.map((n) => n.entryDate);
    return calculateDailyStreak(noteDates, entryDate);
  }, [allNotes, entryDate]);

  const selectedTags = useMemo(() => {
    return tags.filter((t) => selectedTagIds.includes(t.id));
  }, [tags, selectedTagIds]);

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" role="status">
        Loading note...
      </div>
    );
  }

  const dayOfWeek = formatDayOfWeek(entryDate);
  const formattedSlash = formatDateSlash(entryDate);

  return (
    <div className="itu-daily-shell">
      {/* Signature Panel Frame */}
      <div className="itu-daily-panel">
        {/* Panel Header */}
        <PageHeader
          kicker={isDaily ? `Daily writing · ${dayOfWeek || 'Today'}` : 'Journal · Writing'}
          title={
            <input
              type="text"
              placeholder={isDaily ? 'Daily note' : 'Note title…'}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                void handleAutosave(undefined, e.target.value);
              }}
              className="w-full bg-transparent text-[1.75rem] font-extrabold leading-[1.05] tracking-[-0.04em] text-white outline-none placeholder:text-white/40"
            />
          }
          description={
            <div className="itu-daily-meta-row">
              <label className="itu-daily-chip cursor-pointer" title="Change date">
                <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{formattedSlash || entryDate}</span>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => {
                    const newD = e.target.value;
                    if (newD) {
                      setEntryDate(newD);
                      void handleAutosave(undefined, undefined, undefined, newD);
                    }
                  }}
                  className="sr-only"
                />
              </label>

              <TagPicker
                selectedTagIds={selectedTagIds}
                onChange={(newTags) => {
                  setSelectedTagIds(newTags);
                  void handleAutosave(undefined, undefined, newTags);
                }}
              />

              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  aria-label="Open note actions"
                  aria-expanded={showMenu}
                  aria-haspopup="menu"
                  className="itu-daily-chip cursor-pointer p-1.5"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div
                    className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-border bg-card p-1.5 text-xs shadow-lg"
                    role="menu"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowTemplates(true);
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-muted focus-visible:outline-none"
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
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-destructive hover:bg-destructive/10 focus-visible:outline-none"
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
          }
        >
          <DailyStreakBadge value={streakCount} label="Day streak" />
        </PageHeader>

        {/* Body Layout: 2 Columns */}
        <div className="itu-daily-body-row">
          {/* Main Writing Column */}
          <div className="itu-daily-write-col">
            {/* Mode row: Write / Preview / Source + Saved status */}
            <div className="itu-daily-mode-row">
              <div className="itu-daily-mode-tabs" role="tablist" aria-label="Editor display mode">
                <button
                  type="button"
                  className={editorMode === 'write' ? 'on' : ''}
                  onClick={() => setEditorMode('write')}
                  role="tab"
                  aria-selected={editorMode === 'write'}
                >
                  Write
                </button>
                <button
                  type="button"
                  className={editorMode === 'preview' ? 'on' : ''}
                  onClick={() => setEditorMode('preview')}
                  role="tab"
                  aria-selected={editorMode === 'preview'}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className={editorMode === 'source' ? 'on' : ''}
                  onClick={() => setEditorMode('source')}
                  role="tab"
                  aria-selected={editorMode === 'source'}
                >
                  Source
                </button>
              </div>

              <div className="itu-daily-saved">
                <span className="dot" />
                {saveStatus === 'syncing'
                  ? 'Saving…'
                  : `Saved locally · ${lastSavedTime || 'Just now'}`}
              </div>
            </div>

            {/* Editor Canvas */}
            <div className="itu-daily-editor-wrap">
              <JournalMarkdownEditor
                value={contentMarkdown}
                onChange={(val) => {
                  setContentMarkdown(val);
                  void handleAutosave(val);
                }}
                saveStatus={saveStatus}
                placeholder="What's on your mind today? Markdown and [[links]] both work."
                minHeight="360px"
                frameless={true}
              />
            </div>

            {/* Prompt Line */}
            <div className="itu-daily-prompt-line">
              Prompt — <b>{promptText}</b>
            </div>
          </div>

          {/* Side Column: Outline, Linked Notes, Attachments, Metadata (NO DOCUMENT STATS) */}
          <div className="itu-daily-side-col">
            {/* Outline */}
            <div className="itu-daily-side-block">
              <p className="itu-daily-side-label">Outline</p>
              {headings.length === 0 ? (
                <p className="itu-daily-outline-empty">
                  No headings yet — start with a # to structure this note.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {headings.map((h, i) => (
                    <li key={i} style={{ paddingLeft: `${(h.level - 1) * 10}px` }}>
                      <span className="block truncate text-foreground/80 hover:text-primary transition-colors py-0.5">
                        {h.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Linked Notes */}
            <div className="itu-daily-side-block">
              <p className="itu-daily-side-label">Linked notes</p>
              {linkedNotes.length === 0 ? (
                <p className="itu-daily-outline-empty">Nothing linked yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {linkedNotes.map((link, idx) => (
                    <span
                      key={idx}
                      className="itu-daily-chip text-[11px] py-1 px-2 text-primary bg-primary/10 border-primary/20"
                    >
                      [[{link}]]
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Attachments */}
            {id && (
              <div className="itu-daily-side-block">
                <p className="itu-daily-side-label">
                  Attachments ({existingEntry?.attachments?.length || 0})
                </p>
                {existingEntry?.attachments && existingEntry.attachments.length > 0 ? (
                  <AttachmentTray entryId={id} attachments={existingEntry.attachments} />
                ) : (
                  <p className="itu-daily-outline-empty">No files attached.</p>
                )}
              </div>
            )}

            {/* Metadata */}
            <div className="itu-daily-side-block">
              <p className="itu-daily-side-label">Metadata</p>
              <div className="itu-daily-meta-mono">
                <div>
                  <span>Entry date</span> · {entryDate}
                </div>
                <div>
                  <span>Version</span> · v{existingEntry?.version || 1}
                </div>
                <div>
                  <span>Updated</span> · {lastSavedTime || '13:14'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template Selection Dialog */}
      <TemplateEditor
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={applyTemplate}
      />
    </div>
  );
}
