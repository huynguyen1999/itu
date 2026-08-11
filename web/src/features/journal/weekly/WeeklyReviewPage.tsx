import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
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
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';

export function WeeklyReviewPage() {
  const { entryId } = useParams();
  const isNew = !entryId || entryId === 'new';
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

  const [periodStart, setPeriodStart] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + 1);
    return date.toISOString().split('T')[0];
  });

  const [periodEnd, setPeriodEnd] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + 7);
    return date.toISOString().split('T')[0];
  });

  const {
    data: weeklyMetrics,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useWeeklySummary(periodStart, periodEnd);

  const [wentWell, setWentWell] = useState('');
  const [friction, setFriction] = useState('');
  const [nextWeek, setNextWeek] = useState('');
  const [experimentHypothesis, setExperimentHypothesis] = useState('');
  const [experimentAction, setExperimentAction] = useState('');
  const [experimentSuccess, setExperimentSuccess] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');

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
      return;
    }

    await updateMutation.mutateAsync({ id, title, contentMarkdown, weeklyReview: payloadReview });
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-20" aria-busy={isSaving}>
      <header className="itu-page-header-sticky flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--itu-radius-s)] border border-primary/25 bg-primary/10 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <label className="sr-only" htmlFor="weekly-review-title">
              Weekly review title
            </label>
            <input
              id="weekly-review-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full bg-transparent text-2xl font-bold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-3xl"
            />
            <p className="text-xs text-muted-foreground">Reflection & Tiny Experiments</p>
          </div>
        </div>

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
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving} className="w-full sm:w-auto">
            {isSaving ? 'Saving…' : 'Save Review'}
          </Button>
        </div>
      </header>

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
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
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
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ReflectionCard
          icon={<Trophy className="h-4 w-4 text-primary" />}
          title="What went well"
          placeholder="Wins, achievements, positive habits..."
          value={wentWell}
          onChange={setWentWell}
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
    </div>
  );
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
