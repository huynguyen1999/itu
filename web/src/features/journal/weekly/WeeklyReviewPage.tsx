import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Dumbbell,
  Flame,
  Globe,
  LoaderCircle,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { useJournalEntry, useWeeklySummary } from '../journalQueries';
import { useCreateJournalEntryMutation, useUpdateJournalEntryMutation } from '../journalMutations';
import { JournalMarkdownEditor } from '../components/JournalMarkdownEditor';
import { createUlid } from '@/shared/sync/syncIdentity';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { getJournalWeekRange, getLocalTodayDateString } from '../journalDate';
import { useSync } from '@/shared/sync/SyncProvider';
import type { ReviewInsightsResult } from '../journal.types';

export function WeeklyReviewPage() {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const isNew = !entryId || entryId === 'new';
  const preferencesQuery = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const {
    data: existingEntry,
    isLoading: isEntryLoading,
    isError: isEntryError,
    refetch: refetchEntry,
  } = useJournalEntry(entryId || '', isNew);

  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();

  const [id] = useState(entryId || createUlid());
  const [title, setTitle] = useState(() => getWeekTitle(new Date()));

  const initialRange = getJournalWeekRange(new Date(), 'MONDAY');
  const [periodStart, setPeriodStart] = useState(initialRange.start);
  const [periodEnd, setPeriodEnd] = useState(initialRange.end);

  useEffect(() => {
    if (!isNew || !preferencesQuery.data?.journal.weekStartDay) return;
    const range = getJournalWeekRange(new Date(), preferencesQuery.data.journal.weekStartDay);
    if (periodStart === initialRange.start && periodEnd === initialRange.end) {
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
    }
  }, [initialRange.end, initialRange.start, isNew, periodEnd, periodStart, preferencesQuery.data?.journal.weekStartDay]);

  const {
    data: weeklyMetrics,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useWeeklySummary(periodStart, periodEnd);

  const [wentWell, setWentWell] = useState('');
  const [friction, setFriction] = useState('');
  const [learned, setLearned] = useState('');
  const [differentFromLastWeek, setDifferentFromLastWeek] = useState('');
  const [nextWeek, setNextWeek] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isInsightsOpen, setIsInsightsOpen] = useState(true);

  const { state: syncState, pendingMutations, flush, syncQueue } = useSync();
  const reviewPending = pendingMutations.some(
    (mutation) => mutation.entityId === id && (mutation.kind === 'journal.create' || mutation.kind === 'journal.update'),
  );

  const tasksCompleted = weeklyMetrics?.tasks?.completed ?? 0;
  const focusMinutes = weeklyMetrics?.focus?.minutes ?? 0;
  const habitsCompleted = weeklyMetrics?.habits?.completed ?? 0;
  const habitsScheduled = weeklyMetrics?.habits?.scheduled ?? 0;
  const workoutsCount = weeklyMetrics?.workouts?.sessions ?? weeklyMetrics?.gym?.workouts ?? 0;
  const spendingVnd = weeklyMetrics?.expenses?.VND ?? weeklyMetrics?.budget?.spendingByCurrency?.VND ?? 0;
  const learningReviews = weeklyMetrics?.learning?.reviews ?? 0;
  const appActiveSeconds = (weeklyMetrics?.reviewContext?.metrics as { appUsage?: { activeSeconds?: number } } | undefined)?.appUsage?.activeSeconds;
  const websiteActiveSeconds = (weeklyMetrics?.reviewContext?.metrics as { websiteUsage?: { activeSeconds?: number } } | undefined)?.websiteUsage?.activeSeconds;

  const comparisons = weeklyMetrics?.reviewContext?.previousPeriod?.comparison as Record<string, { current: number; previous: number; absoluteDelta: number; percentDelta: number | null; direction: string }> | undefined;

  useEffect(() => {
    if (!existingEntry?.weeklyReview) return;
    setTitle(existingEntry.title || getWeekTitle(new Date(existingEntry.entryDate)));
    setWentWell(existingEntry.weeklyReview.wentWellMarkdown || '');
    setFriction(existingEntry.weeklyReview.frictionMarkdown || '');
    setLearned(existingEntry.weeklyReview.learnedMarkdown || '');
    setDifferentFromLastWeek(existingEntry.weeklyReview.differentFromLastWeekMarkdown || '');
    setNextWeek(existingEntry.weeklyReview.nextWeekMarkdown || '');
    setContentMarkdown(existingEntry.contentMarkdown || '');
  }, [existingEntry]);

  const handleSave = async () => {
    const payloadReview = {
      periodStart,
      periodEnd,
      wentWellMarkdown: wentWell,
      frictionMarkdown: friction,
      learnedMarkdown: learned,
      differentFromLastWeekMarkdown: differentFromLastWeek,
      nextWeekMarkdown: nextWeek,
      experimentSnapshot: existingEntry?.weeklyReview?.experimentSnapshot || {
        hypothesis: '',
        action: '',
        success: '',
      },
      summarySnapshot: weeklyMetrics || {},
    };

    if (isNew) {
      await createMutation.mutateAsync({
        id,
        kind: 'WEEKLY_REVIEW',
        title: title || 'Weekly Review',
        contentMarkdown,
        entryDate: periodStart,
        weeklyReview: payloadReview,
      });
      navigate(`/journal/weekly/${id}`, { replace: true });
      return;
    }

    await updateMutation.mutateAsync({ id, title, contentMarkdown, weeklyReview: payloadReview });
  };

  const generate = async () => {
    if (isNew || isGenerating || syncState.phase === 'offline') return;
    setAiError(null);
    setIsGenerating(true);
    try {
      await handleSave();
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

  const weekDays = useMemo(() => {
    const start = new Date(periodStart);
    const todayStr = getLocalTodayDateString();
    const days: Array<{ label: string; dateStr: string; isToday: boolean; isFilled: boolean }> = [];
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      days.push({
        label: dayLabels[i] ?? 'D',
        dateStr: iso,
        isToday: iso === todayStr,
        isFilled: iso <= todayStr,
      });
    }
    return days;
  }, [periodStart]);

  if (isEntryLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="h-4 w-4 motion-safe:animate-spin text-primary" /> Loading weekly review…
      </div>
    );
  }

  if (isEntryError) {
    return (
      <div
        className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center gap-3 rounded-[var(--itu-radius-m)] border border-destructive/25 bg-destructive/10 p-6 text-center text-sm text-destructive"
        role="alert"
      >
        <p>Weekly review could not be loaded.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetchEntry()}>
          Retry
        </Button>
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const currentContextMetrics = (weeklyMetrics as { reviewContext?: { metrics?: unknown } } | undefined)?.reviewContext?.metrics;
  const stale = Boolean(
    existingEntry?.weeklyReview?.aiInsightsSnapshot &&
      (existingEntry.weeklyReview.aiSourceEntryVersion !== existingEntry.version ||
        (currentContextMetrics && JSON.stringify(currentContextMetrics) !== JSON.stringify(existingEntry.weeklyReview.summarySnapshot))),
  );

  const rawInsights = existingEntry?.weeklyReview?.aiInsightsSnapshot as unknown;
  const aiInsights: ReviewInsightsResult | null = isReviewInsightsResult(rawInsights) ? rawInsights : null;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 pb-20" aria-busy={isSaving}>
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border/80 pb-4">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]" />
            Weekly Writing
          </p>
          <div className="flex items-center gap-2">
            <input
              id="weekly-review-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Weekly review title"
              className="min-w-0 bg-transparent font-serif text-2xl font-normal tracking-[-0.01em] text-foreground outline-none transition-colors hover:text-primary focus:text-primary focus-visible:ring-1 focus-visible:ring-primary sm:text-[27px]"
            />
          </div>
          <p className="text-xs text-muted-foreground">Reflection &amp; weekly synthesis</p>
          <div className="flex items-center gap-2 pt-1">
            {weekDays.map((day, idx) => (
              <div
                key={`${day.dateStr}-${idx}`}
                className={`flex flex-col items-center gap-1 font-mono text-[9px] ${
                  day.isToday ? 'font-bold text-primary' : 'text-muted-foreground/70'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full border transition-all ${
                    day.isFilled
                      ? 'border-primary bg-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]'
                      : 'border-border bg-muted/60'
                  }`}
                />
                {day.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2.5 sm:items-end">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground shadow-sm">
            <label className="sr-only" htmlFor="weekly-period-start">
              Review period start
            </label>
            <input
              id="weekly-period-start"
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              className="bg-transparent text-xs text-foreground outline-none"
            />
            <span className="text-muted-foreground/60" aria-hidden="true">
              —
            </span>
            <label className="sr-only" htmlFor="weekly-period-end">
              Review period end
            </label>
            <input
              id="weekly-period-end"
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              className="bg-transparent text-xs text-foreground outline-none"
            />
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
              onClick={() => void handleSave()}
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
            This week&apos;s ledger
          </span>
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
            {isSummaryLoading ? (
              <span>Loading metrics…</span>
            ) : isSummaryError ? (
              <button
                type="button"
                onClick={() => void refetchSummary()}
                className="text-destructive hover:underline"
              >
                Retry metrics
              </button>
            ) : (
              <span>vs. last week</span>
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
            delta={getComparisonDelta(comparisons?.['tasks.completed'], 'done', 'was')}
          />

          {/* Focus */}
          <LedgerItem
            icon={<Clock className="h-3 w-3 text-primary" />}
            label="Focus"
            value={`${Math.floor(focusMinutes / 60)}h ${focusMinutes % 60}m`}
            delta={getFocusDelta(comparisons?.['focus.minutes'])}
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
            delta={getComparisonDelta(comparisons?.['gym.workouts'], 'sess.')}
          />

          {/* Spending */}
          <LedgerItem
            icon={<Wallet className="h-3 w-3 text-primary" />}
            label="Spending"
            value={`₫${formatCompactMoney(spendingVnd)}`}
            delta={{
              text: spendingVnd > 0 ? 'tracked' : 'no prior data',
              type: 'flat',
            }}
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
            delta={getComparisonDelta(comparisons?.['learning.reviews'], 'rev.', 'was')}
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

      {/* Main Grid: Left Column (Questions + Markdown) & Right Column (AI Insights) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.65fr_1fr]">
        {/* Main: Journal Entries */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="px-5 pt-4 pb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Entry — five questions
              </p>
              <h2 className="font-serif text-base font-normal text-foreground">How the week actually went</h2>
            </div>

            <div className="divide-y divide-border/60">
              <JournalEntryRow
                prompt="What went well?"
                value={wentWell}
                onChange={setWentWell}
                placeholder="Wins, achievements, positive habits, breakthroughs…"
              />

              <JournalEntryRow
                prompt="What did I learn or notice?"
                value={learned}
                onChange={setLearned}
                placeholder="Lessons, observations, patterns, surprises…"
              />

              <JournalEntryRow
                prompt="What felt different from last week?"
                value={differentFromLastWeek}
                onChange={setDifferentFromLastWeek}
                placeholder="Changes in rhythm, energy, context, mindset…"
              />

              <JournalEntryRow
                prompt="What didn't work?"
                value={friction}
                onChange={setFriction}
                isNegative
                placeholder="Friction points, blockers, distractions, missed habits…"
              />

              <JournalEntryRow
                prompt="What I'll try next week"
                value={nextWeek}
                onChange={setNextWeek}
                placeholder="Adjustments, routines, top focus commitments…"
              />
            </div>

            {/* Freeform Markdown Block */}
            <div className="border-t border-border/70 p-4 sm:p-5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Freeform reflection &amp; deep thoughts
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Saved locally
                </span>
              </div>
              <JournalMarkdownEditor
                value={contentMarkdown}
                onChange={setContentMarkdown}
                onSave={() => void handleSave()}
                placeholder="Write freeform reflection, takeaways, deep thoughts…"
                minHeight="180px"
                frameless={false}
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
                    ? `${aiInsights.insights.length} findings from this week's data`
                    : 'Synthesis from weekly data & reflections'}
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
            className="block min-h-[38px] w-full resize-y border-0 bg-transparent p-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-0 sm:text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function getWeekTitle(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `Weekly Review — Week ${weekNum}`;
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

function getComparisonDelta(
  comparison?: { absoluteDelta: number; previous: number },
  unit = '',
  wasLabel = 'was',
): { text: string; type: 'up' | 'down' | 'flat' } {
  if (!comparison) return { text: 'tracked', type: 'flat' };
  const { absoluteDelta, previous } = comparison;
  if (absoluteDelta > 0) {
    return {
      text: `↑${absoluteDelta}${unit ? ` ${unit}` : ''} · ${wasLabel} ${previous}`,
      type: 'up',
    };
  }
  if (absoluteDelta < 0) {
    return {
      text: `↓${Math.abs(absoluteDelta)}${unit ? ` ${unit}` : ''} · ${wasLabel} ${previous}`,
      type: 'down',
    };
  }
  return { text: `0 · was ${previous}`, type: 'flat' };
}

function getFocusDelta(comparison?: { absoluteDelta: number }): { text: string; type: 'up' | 'down' | 'flat' } {
  if (!comparison) return { text: 'tracked', type: 'flat' };
  const { absoluteDelta } = comparison;
  if (absoluteDelta > 0) return { text: `↑${absoluteDelta}m`, type: 'up' };
  if (absoluteDelta < 0) return { text: `↓${Math.abs(absoluteDelta)}m`, type: 'down' };
  return { text: '0m', type: 'flat' };
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
