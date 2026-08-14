import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LoaderCircle, Sparkles } from 'lucide-react';
import { useJournalEntry, useDailySummary, useJournalEntries } from '../journalQueries';
import {
  useCreateJournalEntryMutation,
  useUpdateJournalEntryMutation,
} from '../journalMutations';
import { createUlid } from '@/shared/sync/syncIdentity';
import { useSync } from '@/shared/sync/SyncProvider';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import {
  getLocalTodayDateString,
  formatDateSlash,
} from '../journalDate';
import type { ReviewInsightsResult } from '../journal.types';
import { DailyReviewInsights } from './DailyReviewInsights';
import { DailyReviewLedger } from './DailyReviewLedger';
import { DailyStreakBadge } from '../components/DailyStreakBadge';

type Reflection = { wentWell: string; friction: string; learned: string; context: string };

const MOODS = ['😞', '😐', '🙂', '😄'] as const;

export function DailyReviewPage() {
  const { entryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !entryId || entryId === 'new';

  const dateFromQuery = searchParams.get('date');
  const { data: entry, isLoading, refetch: refetchEntry } = useJournalEntry(entryId || '', isNew);
  const [date, setDate] = useState(() => dateFromQuery || entry?.dailyReview?.periodDate || getLocalTodayDateString());

  useEffect(() => {
    if (entry?.dailyReview?.periodDate) {
      setDate(entry.dailyReview.periodDate);
    } else if (dateFromQuery) {
      setDate(dateFromQuery);
    }
  }, [entry?.dailyReview?.periodDate, dateFromQuery]);

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useDailySummary(date);
  const { data: allNotes = [] } = useJournalEntries({ kind: 'NOTE' });

  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const [id] = useState(entryId && entryId !== 'new' ? entryId : createUlid());
  const [title, setTitle] = useState('');
  const [reflection, setReflection] = useState<Reflection>({
    wentWell: '',
    friction: '',
    learned: '',
    context: '',
  });
  const [mood, setMood] = useState<string>('🙂');
  const [editorMode, setEditorMode] = useState<'edit' | 'source' | 'preview'>('edit');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);
  const [lastAutosaveTime, setLastAutosaveTime] = useState<string>('');

  const { state: syncState, pendingMutations, flush, syncQueue } = useSync();
  const reviewPending = pendingMutations.some(
    (mutation) =>
      mutation.entityId === id &&
      (mutation.kind === 'journal.create' || mutation.kind === 'journal.update'),
  );

  useEffect(() => {
    if (!entry) return;
    if (entry.title) setTitle(entry.title);
    if (entry.dailyReview) {
      setReflection({
        wentWell: entry.dailyReview.wentWellMarkdown || '',
        friction: entry.dailyReview.frictionMarkdown || '',
        learned: entry.dailyReview.learnedMarkdown || '',
        context: entry.dailyReview.contextMarkdown || '',
      });
    }
    if (entry.updatedAt) {
      const d = new Date(entry.updatedAt);
      setLastAutosaveTime(
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      );
    }
  }, [entry]);

  // Find today's morning note to display in "Carried from this morning's note"
  const morningNote = useMemo(() => {
    return allNotes.find((n) => n.entryDate.slice(0, 10) === date);
  }, [allNotes, date]);

  const save = async () => {
    const payload = {
      periodDate: date,
      summarySnapshot: summary?.metrics || {},
      wentWellMarkdown: reflection.wentWell,
      frictionMarkdown: reflection.friction,
      learnedMarkdown: reflection.learned,
      contextMarkdown: reflection.context,
    };
    const resolvedTitle = title.trim() || `Daily Review — ${date}`;
    if (isNew) {
      await createMutation.mutateAsync({
        id,
        kind: 'DAILY_REVIEW',
        title: resolvedTitle,
        entryDate: date,
        dailyReview: payload,
      });
      setLastAutosaveTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      );
      navigate(`/journal/review/daily/${id}`, { replace: true });
      return;
    }
    await updateMutation.mutateAsync({ id, title: resolvedTitle, dailyReview: payload });
    setLastAutosaveTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    );
  };

  const generate = async () => {
    if (isNew || isGenerating || syncState.phase === 'offline') return;
    setAiError(null);
    setIsGenerating(true);
    try {
      await save();
      await flush();
      if ((await syncQueue.listPendingMutations()).length)
        throw new Error('Sync your latest data before generating insights.');
      await api.generateReviewInsights(id);
      await refetchEntry();
      setIsInsightsOpen(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const changeDateBy = (offsetDays: number) => {
    const current = new Date(date);
    current.setDate(current.getDate() + offsetDays);
    setDate(current.toISOString().split('T')[0]);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="h-4 w-4 motion-safe:animate-spin text-primary" /> Loading daily review…
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const stale = Boolean(
    entry?.dailyReview?.aiInsightsSnapshot &&
      (entry.dailyReview.aiSourceEntryVersion !== entry.version ||
        (summary?.metrics &&
          JSON.stringify(summary.metrics) !==
            JSON.stringify(entry.dailyReview.summarySnapshot))),
  );
  const rawInsights = entry?.dailyReview?.aiInsightsSnapshot as unknown;
  const aiInsights: ReviewInsightsResult | null = isReviewInsightsResult(rawInsights)
    ? rawInsights
    : null;

  const formattedSlash = formatDateSlash(date);
  const versionNum = entry?.version ? `v${entry.version}` : 'v1';

  return (
    <div className="itu-daily-shell" aria-busy={isSaving}>
      {/* Signature Panel Frame */}
      <div className="itu-daily-panel">
        {/* Panel Header */}
        <div className="itu-daily-header">
          <div>
            <p className="itu-daily-eyebrow">Daily review · Reflect on today</p>
            <h1 className="itu-daily-title">
              <input
                id="daily-review-title"
                type="text"
                value={title || 'Daily review'}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="Daily review title"
                className="bg-transparent border-none outline-none font-serif text-3xl font-medium w-full text-foreground placeholder:text-muted-foreground/40"
              />
            </h1>

            {/* Meta Row */}
            <div className="itu-daily-meta-row">
              <div className="itu-daily-chip">
                <button
                  type="button"
                  onClick={() => changeDateBy(-1)}
                  title="Previous day"
                  aria-label="Previous day"
                  className="rounded hover:text-primary transition-colors p-0.5"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span>{formattedSlash || date}</span>
                <button
                  type="button"
                  onClick={() => changeDateBy(1)}
                  title="Next day"
                  aria-label="Next day"
                  className="rounded hover:text-primary transition-colors p-0.5"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <span className="itu-daily-chip tag">#daily-review</span>
              <span className="itu-daily-chip add">+ Add tag</span>

              <div className="flex items-center gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void generate()}
                  disabled={
                    isNew ||
                    isSaving ||
                    reviewPending ||
                    syncState.phase === 'offline' ||
                    isGenerating
                  }
                  aria-busy={isGenerating}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {isGenerating ? 'Generating…' : 'Generate AI Insights'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void save()}
                  disabled={isSaving}
                  className="text-xs font-semibold"
                >
                  {isSaving ? 'Saving…' : 'Save Review'}
                </Button>
              </div>
            </div>
          </div>

          {/* Revision Ring Indicator */}
          <DailyStreakBadge value={versionNum} label="Revision" isRevision={true} />
        </div>

        {/* Body Layout: 2 Columns */}
        <div className="itu-daily-body-row">
          {/* Main Reflection Column */}
          <div className="itu-daily-write-col">
            {/* Mode row: Edit / Source / Preview + Autosaved status */}
            <div className="itu-daily-mode-row">
              <div className="itu-daily-mode-tabs" role="tablist" aria-label="Review editing mode">
                <button
                  type="button"
                  className={editorMode === 'edit' ? 'on' : ''}
                  onClick={() => setEditorMode('edit')}
                  role="tab"
                  aria-selected={editorMode === 'edit'}
                >
                  Edit
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
                <button
                  type="button"
                  className={editorMode === 'preview' ? 'on' : ''}
                  onClick={() => setEditorMode('preview')}
                  role="tab"
                  aria-selected={editorMode === 'preview'}
                >
                  Preview
                </button>
              </div>

              <div className="itu-daily-saved">
                <span className="dot" />
                Autosaved · {lastAutosaveTime || '13:14:21'}
              </div>
            </div>

            {/* Carried from this morning's note */}
            <div className="itu-daily-yesterday-box">
              <span className="lbl">Carried from this morning's note</span>
              {morningNote?.contentMarkdown?.trim() ? (
                <p className="line-clamp-3 text-sm leading-relaxed">{morningNote.contentMarkdown}</p>
              ) : morningNote?.title ? (
                <p className="text-sm italic">{morningNote.title}</p>
              ) : (
                <p className="text-sm italic opacity-75">No morning note recorded for today.</p>
              )}
            </div>

            {/* Entry — four questions */}
            <div className="space-y-4">
              <div className="px-1 pt-1 pb-2">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  Entry — four questions
                </p>
                <h2 className="font-serif text-lg font-normal text-foreground">
                  How the day actually went
                </h2>
              </div>

              <div className="divide-y divide-border/60 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <JournalEntryRow
                  prompt="What went well?"
                  value={reflection.wentWell}
                  onChange={(value) =>
                    setReflection((previous) => ({ ...previous, wentWell: value }))
                  }
                  placeholder="Wins, accomplishments, positive moments, flow state…"
                />
                <JournalEntryRow
                  prompt="What felt difficult or distracting?"
                  value={reflection.friction}
                  onChange={(value) =>
                    setReflection((previous) => ({ ...previous, friction: value }))
                  }
                  isNegative
                  placeholder="Friction points, interruptions, blockers, fatigue…"
                />
                <JournalEntryRow
                  prompt="What did I learn or notice?"
                  value={reflection.learned}
                  onChange={(value) =>
                    setReflection((previous) => ({ ...previous, learned: value }))
                  }
                  placeholder="Insights, patterns, realizations, surprises…"
                />
                <JournalEntryRow
                  prompt="Anything important the data doesn’t show?"
                  value={reflection.context}
                  onChange={(value) =>
                    setReflection((previous) => ({ ...previous, context: value }))
                  }
                  placeholder="Qualitative context, mood, conversations, serendipity…"
                />
              </div>
            </div>

            {/* Prompt Line */}
            <div className="itu-daily-prompt-line">
              Prompt — <b>Where did today diverge from the plan, and was that good or bad?</b>
            </div>
          </div>

          {/* Side Column: How today felt (Mood), Attachments, Metadata, AI Insights, Ledger (NO DOCUMENT STATS) */}
          <div className="itu-daily-side-col space-y-6">
            {/* How today felt */}
            <div className="itu-daily-side-block">
              <p className="itu-daily-side-label">How today felt</p>
              <div className="itu-daily-mood-row" role="radiogroup" aria-label="How today felt">
                {MOODS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setMood(emoji)}
                    className={`itu-daily-mood-btn ${mood === emoji ? 'on' : ''}`}
                    role="radio"
                    aria-checked={mood === emoji}
                    aria-label={`Mood ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Attachments */}
            <div className="itu-daily-side-block">
              <p className="itu-daily-side-label">
                Attachments ({entry?.attachments?.length || 0})
              </p>
              <p className="itu-daily-outline-empty">No files attached.</p>
            </div>

            {/* Metadata */}
            <div className="itu-daily-side-block">
              <p className="itu-daily-side-label">Metadata</p>
              <div className="itu-daily-meta-mono">
                <div>
                  <span>Entry date</span> · {date}
                </div>
                <div>
                  <span>Version</span> · {versionNum}
                </div>
                <div>
                  <span>Updated</span> · {lastAutosaveTime || '13:14:21'}
                </div>
              </div>
            </div>

            {/* AI Insights and Daily Summary Ledger (Kept accessible & integrated) */}
            <div className="space-y-4 pt-2 border-t border-border/40">
              <DailyReviewInsights
                insights={aiInsights}
                isOpen={isInsightsOpen}
                onToggle={() => setIsInsightsOpen((open) => !open)}
                isGenerating={isGenerating}
                aiError={aiError}
                stale={stale}
                onGenerate={() => void generate()}
                isNew={isNew}
                isSaving={isSaving}
                reviewPending={reviewPending}
                isOffline={syncState.phase === 'offline'}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Daily Summary Ledger at bottom of view */}
      <div className="mt-8">
        <DailyReviewLedger
          metrics={summary?.metrics}
          isLoading={isSummaryLoading}
          onRefresh={() => void refetchSummary()}
        />
      </div>
    </div>
  );
}

function JournalEntryRow({
  prompt,
  value,
  onChange,
  placeholder,
  isNegative = false,
}: {
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  isNegative?: boolean;
}) {
  return (
    <div className="grid grid-cols-[18px_1fr] items-start gap-2.5 px-4 py-3 sm:px-5">
      <div
        className={`select-none font-serif text-base italic leading-snug ${
          isNegative ? 'text-amber-500' : 'text-primary'
        }`}
      >
        ”
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="font-serif text-[13.5px] italic text-foreground">{prompt}</p>
        <div className="rounded-lg border border-border/80 bg-muted/30 p-0.5 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            rows={2}
            className="block min-h-[44px] w-full resize-y border-0 bg-transparent p-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-0 sm:text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function isReviewInsightsResult(value: unknown): value is ReviewInsightsResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as ReviewInsightsResult;
  return (
    typeof result.headline === 'string' &&
    typeof result.summary === 'string' &&
    Array.isArray(result.insights) &&
    Array.isArray(result.attentionNext)
  );
}
