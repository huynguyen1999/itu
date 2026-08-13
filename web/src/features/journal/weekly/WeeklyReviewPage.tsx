import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  LoaderCircle,
  Sparkles,
  Trophy,
  Wallet,
  Zap,
} from 'lucide-react';
import { useJournalEntry, useWeeklySummary } from '../journalQueries';
import { useCreateJournalEntryMutation, useUpdateJournalEntryMutation } from '../journalMutations';
import { JournalMarkdownEditor } from '../components/JournalMarkdownEditor';
import { createUlid } from '@/shared/sync/syncIdentity';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/PageHeader';
import { getJournalWeekRange } from '../journalDate';
import { ReviewAiInsights } from '../components/ReviewAiInsights';
import { useSync } from '@/shared/sync/SyncProvider';
import type { AiJob } from '@/shared/api/types';

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
  const [title, setTitle] = useState('Weekly Review — Week 32');

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
  const [experimentHypothesis, setExperimentHypothesis] = useState('');
  const [experimentAction, setExperimentAction] = useState('');
  const [experimentSuccess, setExperimentSuccess] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [job, setJob] = useState<AiJob | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const { state: syncState, pendingMutations } = useSync();
  const reviewPending = pendingMutations.some(
    (mutation) => mutation.entityId === id && (mutation.kind === 'journal.create' || mutation.kind === 'journal.update'),
  );

  useEffect(() => {
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return;
    let cancelled = false;
    const poll = () => {
      void api.job(job.id).then((data) => {
        if (cancelled) return;
        setAiError(null);
        setJob(data);
        if (data.status === 'COMPLETED') void refetchEntry();
      }).catch((error) => {
        if (!cancelled) setAiError(error instanceof Error ? `Job status: ${error.message}` : 'Job status could not be refreshed. Retrying…');
      });
    };
    const timer = window.setInterval(poll, 1500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, refetchEntry]);

  const tasksCompleted = weeklyMetrics?.tasks?.completed ?? 0;
  const focusMinutes = weeklyMetrics?.focus?.minutes ?? 0;
  const habitsCompleted = weeklyMetrics?.habits?.completed ?? 0;
  const habitsScheduled = weeklyMetrics?.habits?.scheduled ?? 0;
  const workoutsCount = weeklyMetrics?.workouts?.sessions ?? 0;
  const spendingVnd = weeklyMetrics?.expenses?.VND ?? 0;

  useEffect(() => {
    if (!existingEntry?.weeklyReview) return;
    setTitle(existingEntry.title || 'Weekly Review');
    setWentWell(existingEntry.weeklyReview.wentWellMarkdown || '');
    setFriction(existingEntry.weeklyReview.frictionMarkdown || '');
    setLearned(existingEntry.weeklyReview.learnedMarkdown || '');
    setDifferentFromLastWeek(existingEntry.weeklyReview.differentFromLastWeekMarkdown || '');
    setNextWeek(existingEntry.weeklyReview.nextWeekMarkdown || '');
    setContentMarkdown(existingEntry.contentMarkdown || '');

    if (existingEntry.weeklyReview.experimentSnapshot) {
      const snapshot = existingEntry.weeklyReview.experimentSnapshot;
      setExperimentHypothesis(snapshot.hypothesis || '');
      setExperimentAction(snapshot.action || '');
      setExperimentSuccess(snapshot.success || '');
    }
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
      experimentSnapshot: {
        hypothesis: experimentHypothesis,
        action: experimentAction,
        success: experimentSuccess,
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
    if (isNew || reviewPending || syncState.phase === 'offline') return;
    setAiError(null);
    try {
      setJob(await api.requestReviewInsights(id, existingEntry?.version || 1));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI generation could not be started.');
    }
  };

  if (isEntryLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" /> Loading weekly review…
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
  const jobInProgress = job?.status === 'QUEUED' || job?.status === 'RUNNING';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-20" aria-busy={isSaving}>
      <PageHeader
        kicker="Weekly writing"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <Calendar className="h-5 w-5 shrink-0" aria-hidden="true" />
            <label className="sr-only" htmlFor="weekly-review-title">
              Weekly review title
            </label>
            <input
              id="weekly-review-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-[var(--itu-teal-400)]"
            />
          </span>
        }
        description="Reflection & Tiny Experiments"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-h-10 items-center gap-1.5 rounded-[var(--itu-radius-s)] border border-input bg-background px-3 text-xs text-foreground">
            <label className="sr-only" htmlFor="weekly-period-start">
              Review period start
            </label>
            <input
              id="weekly-period-start"
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              className="min-w-0 bg-transparent outline-none"
            />
            <span className="text-muted-foreground" aria-hidden="true">
              –
            </span>
            <label className="sr-only" htmlFor="weekly-period-end">
              Review period end
            </label>
            <input
              id="weekly-period-end"
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              className="min-w-0 bg-transparent outline-none"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving} className="w-full sm:w-auto">
              {isSaving ? 'Saving…' : 'Save Review'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void generate()} disabled={isNew || isSaving || reviewPending || syncState.phase === 'offline' || jobInProgress} aria-busy={jobInProgress}>
              <Sparkles className="h-4 w-4" />{job?.status === 'QUEUED' ? 'Queued…' : job?.status === 'RUNNING' ? 'Generating…' : 'Generate AI Insights'}
            </Button>
          </div>
        </div>
      </PageHeader>
      {reviewPending ? <p className="text-sm text-muted-foreground" role="status">Save Review and wait for sync before generating insights.</p> : null}

      {createMutation.isError || updateMutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          Review could not be saved. Try again.
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Calculated Weekly Metrics
            </span>
            {isSummaryError && (
              <Button type="button" variant="outline" size="sm" onClick={() => void refetchSummary()}>
                Retry metrics
              </Button>
            )}
          </div>

          {isSummaryError ? (
            <p className="rounded-[var(--itu-radius-s)] bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              Weekly metrics could not be loaded.
            </p>
          ) : isSummaryLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading weekly metrics…
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5 lg:grid-cols-8">
              <Metric
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                label="Tasks"
                value={`${tasksCompleted} completed`}
              />
              <Metric
                icon={<Clock className="h-3.5 w-3.5 text-primary" />}
                label="Focus Time"
                value={`${Math.round(focusMinutes / 60)}h ${focusMinutes % 60}m`}
              />
              <Metric
                icon={<Zap className="h-3.5 w-3.5 text-[var(--itu-amber-500)]" />}
                label="Habits"
                value={`${habitsCompleted} / ${habitsScheduled}`}
              />
              <Metric
                icon={<Dumbbell className="h-3.5 w-3.5 text-primary" />}
                label="Training"
                value={`${workoutsCount} workouts`}
              />
              <Metric
                icon={<Wallet className="h-3.5 w-3.5 text-primary" />}
                label="Spending"
                value={`₫${Number(spendingVnd).toLocaleString()}`}
              />
              <Metric icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} label="Learning" value={`${weeklyMetrics?.learning?.reviews ?? 0} reviews`} />
              <Metric icon={<Flame className="h-3.5 w-3.5 text-[var(--itu-amber-500)]" />} label="Apps" value={formatDuration(weeklyMetrics?.reviewContext?.metrics?.appUsage?.activeSeconds)} />
              <Metric icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} label="Websites" value={formatDuration(weeklyMetrics?.reviewContext?.metrics?.websiteUsage?.activeSeconds)} />
            </div>
          )}
        </CardContent>
      </Card>

      {weeklyMetrics?.reviewContext?.previousPeriod?.comparison ? (
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compared with last week</h2>
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
              {Object.entries(weeklyMetrics.reviewContext.previousPeriod.comparison).slice(0, 5).map(([key, comparison]: [string, any]) => (
                <Metric icon={<Zap className="h-3.5 w-3.5 text-primary" />} key={key} label={key.split('.').pop() || key} value={`${comparison.current} vs ${comparison.previous} (${comparison.absoluteDelta > 0 ? '+' : ''}${comparison.absoluteDelta})`} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ReflectionCard
          icon={<Trophy className="h-4 w-4 text-primary" />}
          title="What went well"
          placeholder="Wins, achievements, positive habits..."
          value={wentWell}
          onChange={setWentWell}
        />
        <ReflectionCard
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          title="What did I learn or notice?"
          placeholder="Lessons, patterns, surprises..."
          value={learned}
          onChange={setLearned}
        />
        <ReflectionCard
          icon={<Calendar className="h-4 w-4 text-primary" />}
          title="What felt different from last week?"
          placeholder="Changes in rhythm, energy, or context..."
          value={differentFromLastWeek}
          onChange={setDifferentFromLastWeek}
        />
        <ReflectionCard
          icon={<Flame className="h-4 w-4 text-[var(--itu-amber-500)]" />}
          title="What didn't work"
          placeholder="Friction points, missed habits, distractions..."
          value={friction}
          onChange={setFriction}
        />
        <ReflectionCard
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          title="What I'll try next week"
          placeholder="Adjustments, new routines, focused targets..."
          value={nextWeek}
          onChange={setNextWeek}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Tiny Experiment</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
            <LabeledInput
              id="experiment-hypothesis"
              label="Hypothesis"
              placeholder="I believe that..."
              value={experimentHypothesis}
              onChange={setExperimentHypothesis}
            />
            <LabeledInput
              id="experiment-action"
              label="Action"
              placeholder="For the next 7 days I will..."
              value={experimentAction}
              onChange={setExperimentAction}
            />
            <LabeledInput
              id="experiment-success"
              label="Success Criteria"
              placeholder="Success means..."
              value={experimentSuccess}
              onChange={setExperimentSuccess}
            />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2" aria-labelledby="weekly-markdown-heading">
        <h2 id="weekly-markdown-heading" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Detailed Markdown Reflection
        </h2>
        <JournalMarkdownEditor
          value={contentMarkdown}
          onChange={setContentMarkdown}
          onSave={() => void handleSave()}
          placeholder="Write freeform reflection, takeaways, deep thoughts..."
          minHeight="240px"
          frameless={false}
        />
      </section>
      {aiError ? <p role="alert" className="text-sm text-destructive">{aiError}</p> : null}
      {job?.status === 'FAILED' ? <p role="alert" className="text-sm text-destructive">{job.error || 'AI generation failed.'}</p> : null}
      {isRecord(job?.output) && job.output.stale === true ? <p role="alert" className="text-sm text-destructive">Your reflections changed while these insights were generated. Regenerate to analyze the latest version.</p> : null}
      <ReviewAiInsights result={(isRecord(job?.output) && job.output.stale === true ? existingEntry?.weeklyReview?.aiInsightsSnapshot : job?.status === 'COMPLETED' && isRecord(job.output) ? job.output : existingEntry?.weeklyReview?.aiInsightsSnapshot) as any} job={job} />
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-[var(--itu-radius-s)] border border-border bg-muted/25 p-3">
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon} {label}
      </span>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function formatDuration(value: unknown) {
  const seconds = typeof value === 'number' ? value : 0;
  return seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : `${Math.round(seconds / 60)}m`;
}

function ReflectionCard({
  icon,
  title,
  placeholder,
  value,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col space-y-2 p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
          {icon}
          {title}
        </h2>
        <textarea
          rows={6}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={title}
          className="min-h-[150px] w-full flex-1 resize-none rounded-[var(--itu-radius-s)] border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
      </CardContent>
    </Card>
  );
}

function LabeledInput({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="space-y-1">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
