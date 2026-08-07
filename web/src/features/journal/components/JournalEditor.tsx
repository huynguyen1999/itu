import { useState } from 'react';
import { Calendar, History, LayoutTemplate, Save, Trash2 } from 'lucide-react';
import type { JournalEntry, JournalEntryKind, JournalExpense, JournalWeeklyReview, JournalWorkout } from '../journal.types';
import { TagPicker } from './TagPicker';
import { AttachmentTray } from './AttachmentTray';
import { ExpenseEditor } from './ExpenseEditor';
import { WorkoutEditor } from './WorkoutEditor';
import { WeeklyReviewEditor } from './WeeklyReviewEditor';
import { RevisionHistory } from './RevisionHistory';
import { TemplateEditor } from './TemplateEditor';
import { JournalMarkdownEditor, SaveStatus } from './JournalMarkdownEditor';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';

interface JournalEditorProps {
  initialEntry?: Partial<JournalEntry>;
  onSave: (entry: Partial<JournalEntry>) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving?: boolean;
}

export function JournalEditor({ initialEntry, onSave, onDelete, isSaving }: JournalEditorProps) {
  const [kind, setKind] = useState<JournalEntryKind>(initialEntry?.kind || 'NOTE');
  const [title, setTitle] = useState(initialEntry?.title || '');
  const [contentMarkdown, setContentMarkdown] = useState(initialEntry?.contentMarkdown || '');
  const [entryDate, setEntryDate] = useState(
    initialEntry?.entryDate
      ? new Date(initialEntry.entryDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    initialEntry?.tags?.map((t) => t.id) || [],
  );
  const [expense, setExpense] = useState<Partial<JournalExpense> | null>(initialEntry?.expense || null);
  const [workout, setWorkout] = useState<Partial<JournalWorkout> | null>(initialEntry?.workout || null);
  const [weeklyReview, setWeeklyReview] = useState<Partial<JournalWeeklyReview> | null>(
    initialEntry?.weeklyReview || null,
  );

  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const handleSave = async (explicitMarkdown?: string) => {
    if (!title.trim()) return;
    setSaveStatus('syncing');
    try {
      await onSave({
        id: initialEntry?.id,
        kind,
        title: title.trim(),
        contentMarkdown: explicitMarkdown !== undefined ? explicitMarkdown : contentMarkdown,
        entryDate,
        templateId: initialEntry?.templateId,
        version: initialEntry?.version,
        tagIds: selectedTagIds,
        expense: kind === 'EXPENSE' ? (expense as any) : null,
        workout: kind === 'WORKOUT' ? (workout as any) : null,
        weeklyReview: kind === 'WEEKLY_REVIEW' ? (weeklyReview as any) : null,
      } as any);
      setSaveStatus('synced');
      setTimeout(() => setSaveStatus('saved'), 2000);
    } catch {
      setSaveStatus('conflict');
    }
  };

  const applyTemplate = (template: any) => {
    setKind(template.entryKind);
    if (template.titleTemplate) {
      setTitle(template.titleTemplate.replace('{{date}}', entryDate));
    }
    if (template.bodyMarkdown) {
      setContentMarkdown(template.bodyMarkdown);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border sticky top-3 z-30 shadow-md">
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as JournalEntryKind)}
            className="bg-background border border-input text-foreground font-semibold text-xs rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="NOTE">NOTE</option>
            <option value="WEEKLY_REVIEW">WEEKLY REVIEW</option>
            <option value="EXPENSE">EXPENSE</option>
            <option value="WORKOUT">WORKOUT</option>
          </select>

          <div className="flex items-center gap-1.5 bg-background border border-input rounded-md px-2.5 py-1 text-xs text-foreground">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="bg-transparent focus:outline-none text-foreground"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowTemplates(true)}
            className="gap-1"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Templates</span>
          </Button>

          {initialEntry?.id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(true)}
              className="gap-1"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Revisions</span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>

          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void onDelete()}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Entry Title & Tags */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <input
            type="text"
            placeholder="Entry Title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          <TagPicker selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
        </CardContent>
      </Card>

      {/* Specialized Editors */}
      {kind === 'EXPENSE' && (
        <ExpenseEditor
          expense={expense as any}
          onChange={(updated) => setExpense({ ...expense, ...updated })}
        />
      )}

      {kind === 'WORKOUT' && (
        <WorkoutEditor
          workout={workout as any}
          onChange={(updated) => setWorkout({ ...workout, ...updated })}
        />
      )}

      {kind === 'WEEKLY_REVIEW' && (
        <WeeklyReviewEditor
          weeklyReview={weeklyReview as any}
          onChange={(updated) => setWeeklyReview({ ...weeklyReview, ...updated })}
          entryDate={entryDate}
        />
      )}

      {/* Content Markdown Area with CodeMirror 6 */}
      <JournalMarkdownEditor
        value={contentMarkdown}
        onChange={setContentMarkdown}
        onSave={(val) => void handleSave(val)}
        saveStatus={saveStatus}
        placeholder="Write thoughts, daily reflection, notes..."
        minHeight="340px"
      />

      {/* Attachment Tray */}
      {initialEntry?.id && (
        <AttachmentTray
          entryId={initialEntry.id}
          attachments={initialEntry.attachments}
        />
      )}

      {/* Modals */}
      {initialEntry?.id && (
        <RevisionHistory
          entryId={initialEntry.id}
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      <TemplateEditor
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={applyTemplate}
      />
    </div>
  );
}
