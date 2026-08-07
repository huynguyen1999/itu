import { useState } from 'react';
import { Calendar, Eye, FileText, History, Save, Sparkles, Tag, Trash2, LayoutTemplate } from 'lucide-react';
import type { JournalEntry, JournalEntryKind, JournalExpense, JournalWeeklyReview, JournalWorkout } from '../journal.types';
import { TagPicker } from './TagPicker';
import { AttachmentTray } from './AttachmentTray';
import { ExpenseEditor } from './ExpenseEditor';
import { WorkoutEditor } from './WorkoutEditor';
import { WeeklyReviewEditor } from './WeeklyReviewEditor';
import { RevisionHistory } from './RevisionHistory';
import { TemplateEditor } from './TemplateEditor';

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

  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    await onSave({
      id: initialEntry?.id,
      kind,
      title: title.trim(),
      contentMarkdown,
      entryDate,
      templateId: initialEntry?.templateId,
      version: initialEntry?.version,
      tagIds: selectedTagIds,
      expense: kind === 'EXPENSE' ? (expense as any) : null,
      workout: kind === 'WORKOUT' ? (workout as any) : null,
      weeklyReview: kind === 'WEEKLY_REVIEW' ? (weeklyReview as any) : null,
    } as any);
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
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-xl backdrop-blur-md sticky top-3 z-30">
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as JournalEntryKind)}
            className="bg-slate-950 border border-slate-800 text-slate-200 font-semibold text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="NOTE">NOTE</option>
            <option value="WEEKLY_REVIEW">WEEKLY REVIEW</option>
            <option value="EXPENSE">EXPENSE</option>
            <option value="WORKOUT">WORKOUT</option>
          </select>

          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="bg-transparent focus:outline-none text-slate-200"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors inline-flex items-center gap-1"
            title="Templates"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">Templates</span>
          </button>

          {initialEntry?.id && (
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors inline-flex items-center gap-1"
              title="History"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium">Revisions</span>
            </button>
          )}

          <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                viewMode === 'edit' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                viewMode === 'preview' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-1 rounded-lg transition-colors font-medium hidden md:block ${
                viewMode === 'split' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Split
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-600/20 transition-all inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Entry Title & Tags */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <input
          type="text"
          placeholder="Entry Title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent text-xl font-bold text-slate-100 placeholder-slate-600 focus:outline-none"
        />

        <TagPicker selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
      </div>

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

      {/* Content Markdown Area */}
      <div
        className={`grid gap-4 ${
          viewMode === 'split' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
              <span>Markdown Reflection Log</span>
              <span className="text-[10px] font-mono text-slate-500">{contentMarkdown.length} chars</span>
            </div>
            <textarea
              rows={16}
              value={contentMarkdown}
              onChange={(e) => setContentMarkdown(e.target.value)}
              placeholder="Write thoughts, daily reflection, notes..."
              className="w-full bg-transparent text-slate-200 font-mono text-xs leading-relaxed focus:outline-none resize-y min-h-[300px]"
            />
          </div>
        )}

        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
            <div className="text-xs font-semibold text-slate-400">Live Preview</div>
            <div className="prose prose-invert prose-slate prose-sm max-w-none whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-300 min-h-[300px] p-2 bg-slate-950/40 rounded-xl border border-slate-800/40">
              {contentMarkdown || <span className="text-slate-600 italic">Nothing to preview...</span>}
            </div>
          </div>
        )}
      </div>

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
