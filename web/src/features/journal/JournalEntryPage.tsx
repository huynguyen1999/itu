import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useJournalEntry } from './journalQueries';
import { useCreateJournalEntryMutation, useDeleteJournalEntryMutation, useUpdateJournalEntryMutation } from './journalMutations';
import { JournalEditor } from './components/JournalEditor';
import type { JournalEntry } from './journal.types';

export function JournalEntryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isNew = location.state?.isNew;
  const initialKind = location.state?.kind || 'NOTE';
  const initialTitle = location.state?.title || '';
  const initialEntryDate = location.state?.entryDate || new Date().toISOString().split('T')[0];

  const { data: existingEntry, isLoading } = useJournalEntry(id || '');
  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const deleteMutation = useDeleteJournalEntryMutation();

  const handleSave = async (data: Partial<JournalEntry>) => {
    if (isNew || !existingEntry) {
      await createMutation.mutateAsync({
        id: id || data.id,
        kind: data.kind || initialKind,
        title: data.title || initialTitle,
        contentMarkdown: data.contentMarkdown,
        entryDate: data.entryDate || initialEntryDate,
        timezone: data.timezone,
        templateId: data.templateId,
        tagIds: (data as any).tagIds,
        weeklyReview: data.weeklyReview,
        expense: data.expense,
        workout: data.workout,
      });
    } else {
      await updateMutation.mutateAsync({
        id: existingEntry.id,
        version: existingEntry.version,
        title: data.title,
        contentMarkdown: data.contentMarkdown,
        entryDate: data.entryDate,
        timezone: data.timezone,
        templateId: data.templateId,
        tagIds: (data as any).tagIds,
        expense: data.expense,
        workout: data.workout,
      });
    }
    navigate('/journal');
  };

  const handleDelete = async () => {
    if (existingEntry) {
      await deleteMutation.mutateAsync({ id: existingEntry.id, version: existingEntry.version });
    }
    navigate('/journal');
  };

  if (!isNew && isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs font-mono">
        Loading entry details...
      </div>
    );
  }

  const initialValues: Partial<JournalEntry> = existingEntry || {
    id,
    kind: initialKind,
    title: initialTitle,
    entryDate: initialEntryDate,
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/journal')}
        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Journal
      </button>

      <JournalEditor
        initialEntry={initialValues}
        onSave={handleSave}
        onDelete={existingEntry ? handleDelete : undefined}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
