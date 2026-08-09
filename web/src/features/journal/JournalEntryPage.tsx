import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, RefreshCw, Trash2 } from 'lucide-react';
import { useJournalEntry } from './journalQueries';
import {
  useCreateJournalEntryMutation,
  useDeleteJournalEntryMutation,
  useUpdateJournalEntryMutation,
} from './journalMutations';
import { JournalEditor } from './components/JournalEditor';
import { getLocalTodayDateString } from './journalDate';
import type { JournalEntry, JournalEntryKind } from './journal.types';

interface JournalDraftLocationState {
  isNew?: boolean;
  kind?: JournalEntryKind;
  title?: string;
  contentMarkdown?: string;
  entryDate?: string;
}

export function JournalEntryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const draftState = (location.state as JournalDraftLocationState | null) ?? null;
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isNew = Boolean(draftState?.isNew);
  const initialKind = draftState?.kind || 'NOTE';
  const initialTitle = draftState?.title || '';
  const initialContentMarkdown = draftState?.contentMarkdown || '';
  const initialEntryDate = draftState?.entryDate || getLocalTodayDateString();

  const { data: existingEntry, isLoading, isError, refetch } = useJournalEntry(id || '', isNew);
  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const deleteMutation = useDeleteJournalEntryMutation();

  const handleSave = async (data: Partial<JournalEntry>) => {
    const entryId = id || data.id;
    const kind = data.kind || initialKind;
    const title = data.title?.trim() || (kind === 'NOTE' ? 'Untitled note' : initialTitle || 'Untitled entry');

    if (isNew || !existingEntry) {
      await createMutation.mutateAsync({
        id: entryId,
        kind,
        title,
        contentMarkdown: data.contentMarkdown,
        entryDate: data.entryDate || initialEntryDate,
        timezone: data.timezone,
        templateId: data.templateId,
        tagIds: (data as any).tagIds,
        weeklyReview: data.weeklyReview,
        expense: data.expense,
        workout: data.workout,
      });
      if (entryId) {
        navigate(`/journal/entry/${entryId}`, { replace: true });
      }
    } else {
      await updateMutation.mutateAsync({
        id: existingEntry.id,
        version: existingEntry.version,
        title,
        contentMarkdown: data.contentMarkdown,
        entryDate: data.entryDate,
        timezone: data.timezone,
        templateId: data.templateId,
        tagIds: (data as any).tagIds,
        weeklyReview: data.weeklyReview,
        expense: data.expense,
        workout: data.workout,
      });
    }
  };

  const handleDelete = async () => {
    if (!existingEntry || !window.confirm('Delete this journal entry? You can restore it from Trash.')) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({ id: existingEntry.id, version: existingEntry.version });
      navigate('/journal');
    } catch {
      setDeleteError('This entry could not be deleted. Your local copy is still here.');
    }
  };

  if (!isNew && isLoading) {
    return (
      <div
        role="status"
        className="mx-auto flex min-h-[360px] max-w-3xl items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading your page…
      </div>
    );
  }

  if (!isNew && (isError || !existingEntry)) {
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-[360px] max-w-xl flex-col items-center justify-center rounded-[var(--itu-radius-m)] border border-border bg-card p-8 text-center"
      >
        <BookOpen className="h-8 w-8 text-primary/70" aria-hidden="true" />
        <h1 className="mt-4 text-base font-semibold text-foreground">This page is unavailable.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your local journal data was not replaced. Try again or return to your pages.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--itu-radius-s)] border border-input bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:border-[var(--itu-teal-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => navigate('/journal')}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--itu-radius-s)] bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Back to Journal
          </button>
        </div>
      </div>
    );
  }

  const initialValues: Partial<JournalEntry> = existingEntry || {
    id,
    kind: initialKind,
    title: initialTitle,
    contentMarkdown: initialContentMarkdown,
    entryDate: initialEntryDate,
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/journal')}
        className="inline-flex min-h-9 items-center gap-2 rounded-[var(--itu-radius-s)] px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Journal
      </button>

      {deleteError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--itu-radius-s)] border border-[var(--itu-coral-500)]/30 bg-[var(--itu-coral-100)]/60 px-3 py-2 text-xs text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5 text-[var(--itu-coral-500)]" aria-hidden="true" />
          {deleteError}
        </div>
      )}

      <JournalEditor
        initialEntry={initialValues}
        onSave={handleSave}
        onDelete={existingEntry ? handleDelete : undefined}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
