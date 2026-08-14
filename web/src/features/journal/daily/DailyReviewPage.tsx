import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  Globe,
  LoaderCircle,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { useJournalEntry, useDailySummary } from '../journalQueries';
import { useCreateJournalEntryMutation, useUpdateJournalEntryMutation } from '../journalMutations';
import { createUlid } from '@/shared/sync/syncIdentity';
import { useSync } from '@/shared/sync/SyncProvider';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { getLocalTodayDateString, formatDateStringToLocalDisplay } from '../journalDate';
import type { ReviewInsightsResult } from '../journal.types';

export function DailyReviewPage() {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const isNew = !entryId || entryId === 'new';
  const { data: entry, isLoading, refetch: refetchEntry } = useJournalEntry(entryId || '', isNew);
  const [date, setDate] = useState(() => entry?.dailyReview?.periodDate || getLocalTodayDateString());

  useEffect(() => {
    if (entry?.dailyReview?.periodDate) {
      setDate(entry.dailyReview.periodDate);
    }
  }, [entry?.dailyReview?.periodDate]);

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useDailySummary(date);
  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const [id] = useState(entryId || createUlid());
  const [title, setTitle] = useState('');
  const [reflection, setReflection] = useState({ wentWell: '', friction: '', learned: '', context: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);

  const { state: syncState, pendingMutations, flush, syncQueue } = useSync();
  const reviewPending = pendingMutations.some(
    (mutation) => mutation.entityId === id && (mutation.kind === 'journal.create' || mutation.kind === 'journal.update'),
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
  }, [entry]);

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
      navigate(`/journal/review/daily/${id}`, { replace: true });
      return;
    }
    await updateMutation.mutateAsync({ id, title: resolvedTitle, dailyReview: payload });
  };

  const generate = async () => {
    if (isNew || isGenerating || syncState.phase === 'offline') return;
    setAiError(null);
    setIsGenerating(true);
    try {
      await save();
      await flush();
      if ((await syncQueue.listPendingMutations()).length) throw new Error('Sync your latest data before generating insights.');
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

  const tasksCompleted = summary?.metrics?.tasks?.completed ?? 0;
  const focusMinutes = summary?.metrics?.focus?.minutes ?? 0;
  const habitsCompleted = summary?.metrics?.habits?.completed ?? 0;
  const habitsScheduled = summary?.metrics?.habits?.scheduled ?? 0;
  const workoutsCount = summary?.metrics?.gym?.workouts ?? summary?.metrics?.workouts?.sessions ?? 0;
  const spending = summary?.metrics?.budget?.spendingByCurrency ?? summary?.metrics?.expenses;
  const learningReviews = summary?.metrics?.learning?.reviews ?? 0;
  const appActiveSeconds = summary?.metrics?.appUsage?.activeSeconds;
  const websiteActiveSeconds = summary?.metrics?.websiteUsage?.activeSeconds;

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const stale = Boolean(
    entry?.dailyReview?.aiInsightsSnapshot &&
      (entry.dailyReview.aiSourceEntryVersion !== entry.version ||
        (summary?.metrics && JSON.stringify(summary.metrics) !== JSON.stringify(entry.dailyReview.summarySnapshot))),
  );

  const rawInsights = entry?.dailyReview?.aiInsightsSnapshot as unknown;
  const aiInsights: ReviewInsightsResult | null = isReviewInsightsResult(rawInsights) ? rawInsights : null;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 pb-20" aria-busy={isSaving}>
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border/80 pb-4">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]" />
            Daily Reflection
          </p>
          <div className="flex items-center gap-2">
            <input
              id="daily-review-title"
              type="text"
              value={title || `Daily Review — ${formatDateStringToLocalDisplay(date)}`}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Daily review title"
              className="min-w-0 bg-transparent font-serif text-2xl font-normal tracking-[-0.01em] text-foreground outline-none transition-colors hover:text-primary focus:text-primary focus-visible:ring-1 focus-visible:ring-primary sm:text-[27px]"
            />
          </div>
          <p className="text-xs text-muted-foreground">Evening reflection &amp; daily synthesis</p>
        </div>

        <div className="flex flex-col items-start gap-2.5 sm:items-end">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-foreground shadow-sm">
            <button
              type="button"
              onClick={() => changeDateBy(-1)}
              title="Previous day"
              aria-label="Previous day"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <label className="sr-only" htmlFor="daily-period-date">
              Review date
            </label>
            <input
              id="daily-period-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="bg-transparent text-xs text-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => changeDateBy(1)}
              title="Next day"
              aria-label="Next day"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void generate()}
              disabled={isNew || isSaving || reviewPending || syncState.phase === 'offline' || isGenerating}
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
      </header>

      {reviewPending ? (
        <p className="text-xs text-muted-foreground" role="status">
          Save Review and wait for sync before generating insights.
        </p>
      ) : null}

      {createMutation.isError || updateMutation.isError ? (
        <p className="text-xs text-destructive" role="alert">
          Review could not be saved. Try again.
        </p>
      ) : null}

      {/* Ledger - Compact First Row */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Today&apos;s ledger
          </span>
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
            {isSummaryLoading ? (
              <span>Loading metrics…</span>
            ) : (
              <button
                type="button"
                onClick={() => void refetchSummary()}
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-y divide-border/50 sm:grid-cols-4 sm:divide-y-0 lg:grid-cols-8">
          {/* Tasks */}
          <LedgerItem
            icon={<CheckCircle2 className="h-3 w-3 text-primary" />}
            label="Tasks"
            value={
              <>
                {tasksCompleted} <small className="text-[10px] font-normal text-muted-foreground">done</small>
              </>
            }
            delta={{ text: `${tasksCompleted} done`, type: tasksCompleted > 0 ? 'up' : 'flat' }}
          />

          {/* Focus */}
          <LedgerItem
            icon={<Clock className="h-3 w-3 text-primary" />}
            label="Focus"
            value={`${Math.floor(focusMinutes / 60)}h ${focusMinutes % 60}m`}
            delta={{ text: `${focusMinutes}m tracked`, type: focusMinutes > 0 ? 'up' : 'flat' }}
          />

          {/* Habits */}
          <LedgerItem
            icon={<Zap className="h-3 w-3 text-amber-500" />}
            label="Habits"
            value={
              <>
                {habitsCompleted}
                <small className="text-[10px] font-normal text-muted-foreground">/{habitsScheduled}</small>
              </>
            }
            delta={{
              text: `${habitsScheduled > 0 ? Math.round((habitsCompleted / habitsScheduled) * 100) : 0}% rate`,
              type: habitsScheduled > 0 && habitsCompleted / habitsScheduled >= 0.7 ? 'up' : 'flat',
            }}
          />

          {/* Training */}
          <LedgerItem
            icon={<Dumbbell className="h-3 w-3 text-primary" />}
            label="Training"
            value={
              <>
                {workoutsCount} <small className="text-[10px] font-normal text-muted-foreground">sess.</small>
              </>
            }
            delta={{ text: workoutsCount > 0 ? `${workoutsCount} logged` : '0 logged', type: workoutsCount > 0 ? 'up' : 'flat' }}
          />

          {/* Spending */}
          <LedgerItem
            icon={<Wallet className="h-3 w-3 text-primary" />}
            label="Spending"
            value={formatSpending(spending)}
            delta={{ text: spending ? 'tracked' : 'no expenses', type: 'flat' }}
          />

          {/* Learning */}
          <LedgerItem
            icon={<Sparkles className="h-3 w-3 text-primary" />}
            label="Learning"
            value={
              <>
                {learningReviews} <small className="text-[10px] font-normal text-muted-foreground">rev.</small>
              </>
            }
            delta={{ text: learningReviews > 0 ? `${learningReviews} rev.` : '0 rev.', type: learningReviews > 0 ? 'up' : 'flat' }}
          />

          {/* Apps */}
          <LedgerItem
            icon={<Flame className="h-3 w-3 text-amber-500" />}
            label="Apps"
            value={formatDuration(appActiveSeconds)}
            delta={{ text: 'tracked', type: 'flat' }}
          />

          {/* Websites */}
          <LedgerItem
            icon={<Globe className="h-3 w-3 text-primary" />}
            label="Websites"
            value={formatDuration(websiteActiveSeconds)}
            delta={{ text: 'tracked', type: 'flat' }}
          />
        </div>
      </section>

      {/* Main Grid: Left Column (4 Questions) & Right Column (AI Insights) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.65fr_1fr]">
        {/* Main: Journal Entries */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="px-5 pt-4 pb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Entry — four questions
              </p>
              <h2 className="font-serif text-base font-normal text-foreground">How the day actually went</h2>
            </div>

            <div className="divide-y divide-border/60">
              <JournalEntryRow
                prompt="What went well?"
                value={reflection.wentWell}
                onChange={(val) => setReflection((prev) => ({ ...prev, wentWell: val }))}
                placeholder="Wins, accomplishments, positive moments, flow state…"
              />

              <JournalEntryRow
                prompt="What felt difficult or distracting?"
                value={reflection.friction}
                onChange={(val) => setReflection((prev) => ({ ...prev, friction: val }))}
                isNegative
                placeholder="Friction points, interruptions, blockers, fatigue…"
              />

              <JournalEntryRow
                prompt="What did I learn or notice?"
                value={reflection.learned}
                onChange={(val) => setReflection((prev) => ({ ...prev, learned: val }))}
                placeholder="Insights, patterns, realizations, surprises…"
              />

              <JournalEntryRow
                prompt="Anything important the data doesn’t show?"
                value={reflection.context}
                onChange={(val) => setReflection((prev) => ({ ...prev, context: val }))}
                placeholder="Qualitative context, mood, conversations, serendipity…"
              />
            </div>
          </div>
        </div>

        {/* Sidebar: AI Insights */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-base font-normal text-foreground">AI insights</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {aiInsights?.insights?.length
                    ? `${aiInsights.insights.length} findings from today's data`
                    : 'Synthesis from daily data & reflections'}
                </p>
              </div>
              {aiInsights ? (
                <button
                  type="button"
                  onClick={() => setIsInsightsOpen(!isInsightsOpen)}
                  className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <span>{isInsightsOpen ? 'Hide' : 'Show'}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${isInsightsOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              ) : null}
            </div>

            {isGenerating ? (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground">
                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <span>Analyzing your saved activity and reflections…</span>
              </div>
            ) : null}

            {aiError ? (
              <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                {aiError}
              </p>
            ) : null}

            {stale ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                <span className="font-bold">⚠</span>
                <span>Reflections changed since insights were generated — regenerate for latest analysis.</span>
              </div>
            ) : null}

            {aiInsights && isInsightsOpen ? (
              <div className="mt-4 space-y-4">
                <div className="space-y-1 border-b border-border/50 pb-3">
                  <h3 className="text-xs font-semibold leading-snug text-foreground">{aiInsights.headline}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{aiInsights.summary}</p>
                </div>

                <div className="space-y-3">
                  {aiInsights.insights.map((insight, idx) => (
                    <div key={`${insight.title}-${idx}`} className="border-b border-border/40 pb-3 last:border-b-0">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-xs font-semibold text-foreground">{insight.title}</strong>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                            insight.confidence === 'HIGH'
                              ? 'bg-primary/15 text-primary'
                              : insight.confidence === 'MEDIUM'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {insight.confidence}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
                      {insight.evidence?.length ? (
                        <details className="mt-1.5 font-mono text-[10.5px] text-primary">
                          <summary className="cursor-pointer font-medium hover:underline">▸ Evidence</summary>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 font-sans text-xs text-muted-foreground">
                            {insight.evidence.map((ev) => (
                              <li key={ev.id}>{ev.label}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>

                {aiInsights.attentionNext?.length ? (
                  <div className="border-t border-border/60 pt-3">
                    <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      Worth noticing next
                    </h4>
                    <ul className="space-y-1.5">
                      {aiInsights.attentionNext.map((item, idx) => (
                        <li key={`${item}-${idx}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="font-bold text-primary">→</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : !aiInsights && !isGenerating ? (
              <div className="mt-4 space-y-3 rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-primary/60" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">No insights generated yet</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Save your review and generate an AI synthesis of tasks, focus, habits, workouts, and reflections.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void generate()}
                  disabled={isNew || isSaving || reviewPending || syncState.phase === 'offline'}
                  className="w-full text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Generate AI Insights
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LedgerItem({
  icon,
  label,
  value,
  delta,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  delta: { text: string; type: 'up' | 'down' | 'flat' };
}) {
  return (
    <div className="flex flex-col gap-1 p-3 sm:border-l sm:border-border/50 sm:first:border-l-0">
      <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="opacity-90">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="font-mono text-sm font-medium tracking-tight text-foreground sm:text-base">{value}</div>
      <div
        className={`w-fit rounded-full px-1.5 py-0.5 font-mono text-[9.5px] ${
          delta.type === 'up'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : delta.type === 'down'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-muted/70 text-muted-foreground'
        }`}
      >
        {delta.text}
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
  onChange: (val: string) => void;
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
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="block min-h-[44px] w-full resize-y border-0 bg-transparent p-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-0 sm:text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function formatDuration(value: unknown) {
  const seconds = typeof value === 'number' ? value : 0;
  return seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : `${Math.round(seconds / 60)}m`;
}

function formatCompactMoney(amount: number): string {
  if (!amount || isNaN(amount)) return '0';
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return amount.toLocaleString();
}

function formatSpending(spending: unknown): string {
  if (!spending || typeof spending !== 'object') return '₫0';
  const entries = Object.entries(spending as Record<string, unknown>);
  if (!entries.length) return '₫0';
  const vnd = (spending as Record<string, number>)?.VND;
  if (vnd !== undefined) {
    return `₫${formatCompactMoney(Number(vnd))}`;
  }
  return entries.map(([currency, amount]) => `${currency} ${formatCompactMoney(Number(amount))}`).join(', ');
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
