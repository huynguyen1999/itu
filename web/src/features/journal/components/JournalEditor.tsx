import { useState } from 'react';
import {
  Calendar,
  Check,
  CloudOff,
  History,
  LayoutTemplate,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type {
  JournalEntry,
  JournalEntryKind,
  JournalExpense,
  JournalWeeklyReview,
  JournalWorkout,
} from '../journal.types';
import { getLocalTodayDateString } from '../journalDate';
import { TagPicker } from './TagPicker';
import { AttachmentTray } from './AttachmentTray';
import { ExpenseEditor } from './ExpenseEditor';
import { WorkoutEditor } from './WorkoutEditor';
import { WeeklyReviewEditor } from './WeeklyReviewEditor';
import { RevisionHistory } from './RevisionHistory';
import { TemplateEditor } from './TemplateEditor';
import { JournalMarkdownEditor, SaveStatus } from './JournalMarkdownEditor';
import { useSync } from '@/shared/sync/SyncProvider';
import { Button } from '@/shared/ui/button';

interface JournalEditorProps {
  initialEntry?: Partial<JournalEntry>;
  onSave: (entry: Partial<JournalEntry>) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving?: boolean;
}

export function JournalEditor({ initialEntry, onSave, onDelete, isSaving }: JournalEditorProps) {
  const { state: syncState } = useSync();
  const [kind, setKind] = useState<JournalEntryKind>(initialEntry?.kind || 'NOTE');
  const [title, setTitle] = useState(initialEntry?.title || '');
  const [contentMarkdown, setContentMarkdown] = useState(initialEntry?.contentMarkdown || '');
  const [entryDate, setEntryDate] = useState(toDateInputValue(initialEntry?.entryDate));
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialEntry?.tags?.map((t) => t.id) || []);
  const [expense, setExpense] = useState<Partial<JournalExpense> | null>(initialEntry?.expense || null);
  const [workout, setWorkout] = useState<Partial<JournalWorkout> | null>(initialEntry?.workout || null);
  const [weeklyReview, setWeeklyReview] = useState<Partial<JournalWeeklyReview> | null>(
    initialEntry?.weeklyReview || null,
  );

  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const handleSave = async (explicitMarkdown?: string) => {
    const nextContent = explicitMarkdown !== undefined ? explicitMarkdown : contentMarkdown;
    if (!title.trim() && !nextContent.trim()) return;

    setSaveStatus('syncing');
    try {
      await onSave({
        id: initialEntry?.id,
        kind,
        title: title.trim() || (kind === 'NOTE' ? 'Untitled note' : 'Untitled entry'),
        contentMarkdown: nextContent,
        entryDate,
        templateId: initialEntry?.templateId,
        version: initialEntry?.version,
        tagIds: selectedTagIds,
        expense: kind === 'EXPENSE' ? (expense as any) : null,
        workout: kind === 'WORKOUT' ? (workout as any) : null,
        weeklyReview: kind === 'WEEKLY_REVIEW' ? (weeklyReview as any) : null,
      });
      // The offline mutation resolves after the local outbox/cache write. The
      // sync badge below communicates whether the server acknowledgement is pending.
      setSaveStatus('saved');
    } catch {
      setSaveStatus('conflict');
    }
  };

  const applyTemplate = (template: any) => {
    setKind(template.entryKind);
    if (template.titleTemplate) setTitle(template.titleTemplate.replace('{{date}}', entryDate));
    if (template.bodyMarkdown) setContentMarkdown(template.bodyMarkdown);
  };

  const syncPresentation = getSyncPresentation(syncState);

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-14">
      <div className="sticky top-3 z-30 rounded-[var(--itu-radius-m)] border border-border bg-card/95 p-3 shadow-[var(--itu-shadow-pop)] backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="journal-entry-kind">
              Entry type
            </label>
            <select
              id="journal-entry-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as JournalEntryKind)}
              className="h-9 max-w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors focus:border-[var(--itu-teal-500)] focus:ring-2 focus:ring-ring"
            >
              <option value="NOTE">Note</option>
              <option value="WEEKLY_REVIEW">Weekly review</option>
              <option value="EXPENSE">Expense entry</option>
              <option value="WORKOUT">Workout entry</option>
            </select>

            <label className="inline-flex h-9 items-center gap-2 rounded-[var(--itu-radius-s)] border border-input bg-background px-3 text-xs text-muted-foreground focus-within:border-[var(--itu-teal-500)] focus-within:ring-2 focus-within:ring-ring">
              <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="sr-only">Entry date</span>
              <input
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                onBlur={() => void handleSave()}
                className="bg-transparent text-foreground outline-none"
              />
            </label>

            <SyncStatus phase={syncPresentation.phase} label={syncPresentation.label} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTemplates(true)}
              className="gap-1.5"
            >
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Templates</span>
              <span className="sr-only sm:hidden">Open templates</span>
            </Button>
            {initialEntry?.id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(true)}
                className="gap-1.5"
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Revisions</span>
                <span className="sr-only sm:hidden">Open revisions</span>
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={isSaving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void onDelete()}
                disabled={isSaving}
                aria-label="Delete journal entry"
                title="Delete journal entry"
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        {saveStatus === 'conflict' && (
          <p
            role="alert"
            className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-destructive"
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            This change could not be queued. Your current text is still on this page; try saving again.
          </p>
        )}
      </div>

      <main className="rounded-[var(--itu-radius-l)] border border-border bg-card p-4 shadow-[var(--itu-shadow-card)] sm:p-7">
        <div className="space-y-4">
          <label className="block">
            <span className="sr-only">Entry title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void handleSave()}
              placeholder="Add a title if you need one"
              className="w-full bg-transparent font-display text-3xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 sm:text-4xl"
            />
          </label>

          <TagPicker selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />

          <div className="border-t border-border/60 pt-5">
            <JournalMarkdownEditor
              value={contentMarkdown}
              onChange={setContentMarkdown}
              onSave={(value) => void handleSave(value)}
              saveStatus={saveStatus}
              placeholder="Start with what is true today…"
              minHeight="440px"
            />
          </div>
        </div>
      </main>

      {kind === 'EXPENSE' && (
        <section aria-labelledby="expense-details" className="space-y-2">
          <h2
            id="expense-details"
            className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-muted-foreground"
          >
            Structured details
          </h2>
          <ExpenseEditor expense={expense as any} onChange={(updated) => setExpense({ ...expense, ...updated })} />
        </section>
      )}

      {kind === 'WORKOUT' && (
        <section aria-labelledby="workout-details" className="space-y-2">
          <h2
            id="workout-details"
            className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-muted-foreground"
          >
            Structured details
          </h2>
          <WorkoutEditor workout={workout as any} onChange={(updated) => setWorkout({ ...workout, ...updated })} />
        </section>
      )}

      {kind === 'WEEKLY_REVIEW' && (
        <section aria-labelledby="weekly-review-details" className="space-y-2">
          <h2
            id="weekly-review-details"
            className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-muted-foreground"
          >
            Structured details
          </h2>
          <WeeklyReviewEditor
            weeklyReview={weeklyReview as any}
            onChange={(updated) => setWeeklyReview({ ...weeklyReview, ...updated })}
            entryDate={entryDate}
          />
        </section>
      )}

      {initialEntry?.id && (
        <section
          aria-labelledby="journal-attachments"
          className="rounded-[var(--itu-radius-m)] border border-border bg-card p-4 sm:p-5"
        >
          <h2 id="journal-attachments" className="sr-only">
            Attachments
          </h2>
          <AttachmentTray entryId={initialEntry.id} attachments={initialEntry.attachments} />
        </section>
      )}

      {initialEntry?.id && (
        <RevisionHistory entryId={initialEntry.id} isOpen={showHistory} onClose={() => setShowHistory(false)} />
      )}

      <TemplateEditor isOpen={showTemplates} onClose={() => setShowTemplates(false)} onSelectTemplate={applyTemplate} />
    </div>
  );
}

function toDateInputValue(value?: string) {
  return value?.slice(0, 10) || getLocalTodayDateString();
}

function SyncStatus({ phase, label }: { phase: string; label: string }) {
  const Icon =
    phase === 'offline' ? CloudOff : phase === 'syncing' ? RefreshCw : phase === 'conflict' ? TriangleAlert : Check;
  const color =
    phase === 'offline' || phase === 'conflict' ? 'text-[var(--itu-coral-500)]' : 'text-[var(--itu-teal-600)]';
  return (
    <span
      className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--itu-radius-s)] border border-border bg-background px-2.5 text-[11px] text-muted-foreground"
      title={label}
    >
      <Icon className={`h-3.5 w-3.5 ${color} ${phase === 'syncing' ? 'animate-spin' : ''}`} aria-hidden="true" />
      <span className="hidden md:inline">{label}</span>
      <span className="sr-only">Journal sync status: {label}</span>
    </span>
  );
}

function getSyncPresentation(state: { phase: string; pendingCount: number; conflictCount: number }) {
  if (state.phase === 'offline') {
    return {
      phase: state.phase,
      label: state.pendingCount
        ? `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} waiting`
        : 'Offline',
    };
  }
  if (state.phase === 'syncing') return { phase: state.phase, label: 'Syncing' };
  if (state.phase === 'conflict') {
    return { phase: state.phase, label: `${state.conflictCount} sync conflict${state.conflictCount === 1 ? '' : 's'}` };
  }
  if (state.pendingCount)
    return { phase: state.phase, label: `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} waiting` };
  return { phase: state.phase, label: 'Up to date' };
}
