import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, LoaderCircle, Sparkles } from 'lucide-react';
import { useJournalEntry, useDailySummary } from '../journalQueries';
import { useCreateJournalEntryMutation, useUpdateJournalEntryMutation } from '../journalMutations';
import { ReviewAiInsights } from '../components/ReviewAiInsights';
import { createUlid } from '@/shared/sync/syncIdentity';
import { useSync } from '@/shared/sync/SyncProvider';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/PageHeader';
import { getLocalTodayDateString, formatDateStringToLocalDisplay } from '../journalDate';
import type { AiJob } from '@/shared/api/types';
import type { ReviewInsightsResult } from '../journal.types';

export function DailyReviewPage() {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const isNew = !entryId || entryId === 'new';
  const { data: entry, isLoading, refetch: refetchEntry } = useJournalEntry(entryId || '', isNew);
  const date = entry?.dailyReview?.periodDate || getLocalTodayDateString();
  const { data: summary } = useDailySummary(entry?.dailyReview?.periodDate || date);
  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const [id] = useState(entryId || createUlid());
  const [reflection, setReflection] = useState({ wentWell: '', friction: '', learned: '', context: '' });
  const [job, setJob] = useState<AiJob | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const { state: syncState, pendingMutations } = useSync();
  const reviewPending = pendingMutations.some(
    (mutation) => mutation.entityId === id && (mutation.kind === 'journal.create' || mutation.kind === 'journal.update'),
  );

  useEffect(() => {
    if (!entry?.dailyReview) return;
    setReflection({
      wentWell: entry.dailyReview.wentWellMarkdown || '',
      friction: entry.dailyReview.frictionMarkdown || '',
      learned: entry.dailyReview.learnedMarkdown || '',
      context: entry.dailyReview.contextMarkdown || '',
    });
  }, [entry]);

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

  const save = async () => {
    const payload = {
      periodDate: date,
      summarySnapshot: summary?.metrics || {},
      wentWellMarkdown: reflection.wentWell,
      frictionMarkdown: reflection.friction,
      learnedMarkdown: reflection.learned,
      contextMarkdown: reflection.context,
    };
    if (isNew) {
      await createMutation.mutateAsync({ id, kind: 'DAILY_REVIEW', title: `Daily Review — ${date}`, entryDate: date, dailyReview: payload });
      navigate(`/journal/review/daily/${id}`, { replace: true });
      return;
    }
    await updateMutation.mutateAsync({ id, dailyReview: payload });
  };

  const generate = async () => {
    if (isNew || reviewPending || syncState.phase === 'offline') return;
    setAiError(null);
    try {
      setJob(await api.requestReviewInsights(id, entry?.version || 1));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI generation could not be started.');
    }
  };

  if (isLoading) return <div className="flex min-h-64 items-center justify-center" role="status"><LoaderCircle className="h-4 w-4 motion-safe:animate-spin" /></div>;
  const stale = job?.status === 'COMPLETED' && isRecord(job.output) && job.output.stale === true;
  const result = (stale ? entry?.dailyReview?.aiInsightsSnapshot : job?.status === 'COMPLETED' && isRecord(job.output) ? job.output : entry?.dailyReview?.aiInsightsSnapshot) as ReviewInsightsResult | null | undefined;
  const jobInProgress = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-20">
      <PageHeader kicker="Daily review" title={<span className="flex items-center gap-2"><Calendar className="h-5 w-5" />Daily Review</span>} description={formatDateStringToLocalDisplay(date)}>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void save()} disabled={createMutation.isPending || updateMutation.isPending}>Save Review</Button>
          <Button type="button" onClick={() => void generate()} disabled={isNew || reviewPending || syncState.phase === 'offline' || jobInProgress} aria-busy={jobInProgress}><Sparkles className="h-4 w-4" />{job?.status === 'QUEUED' ? 'Queued…' : job?.status === 'RUNNING' ? 'Generating…' : 'Generate AI Insights'}</Button>
        </div>
      </PageHeader>
      {reviewPending ? <p className="text-sm text-muted-foreground" role="status">Save Review and wait for sync before generating insights.</p> : null}
      <Card><CardContent className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Tasks" value={`${summary?.metrics?.tasks?.completed || 0} completed`} />
        <Metric label="Focus" value={`${summary?.metrics?.focus?.minutes || 0} min`} />
        <Metric label="Learning" value={`${summary?.metrics?.learning?.reviews || 0} reviews`} />
        <Metric label="Habits" value={`${summary?.metrics?.habits?.completed || 0}/${summary?.metrics?.habits?.scheduled || 0}`} />
        <Metric label="Training" value={`${summary?.metrics?.gym?.workouts || 0} workouts`} />
        <Metric label="Budget" value={formatMoney(summary?.metrics?.budget?.spendingByCurrency)} />
        <Metric label="Apps" value={formatDuration(summary?.metrics?.appUsage?.activeSeconds)} />
        <Metric label="Websites" value={formatDuration(summary?.metrics?.websiteUsage?.activeSeconds)} />
      </CardContent></Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Reflection label="What went well?" value={reflection.wentWell} onChange={(value) => setReflection({ ...reflection, wentWell: value })} />
        <Reflection label="What felt difficult or distracting?" value={reflection.friction} onChange={(value) => setReflection({ ...reflection, friction: value })} />
        <Reflection label="What did I learn or notice?" value={reflection.learned} onChange={(value) => setReflection({ ...reflection, learned: value })} />
        <Reflection label="Anything important the data doesn’t show?" value={reflection.context} onChange={(value) => setReflection({ ...reflection, context: value })} />
      </div>
      {aiError ? <p role="alert" className="text-sm text-destructive">{aiError}</p> : null}
      {job?.status === 'FAILED' ? <p role="alert" className="text-sm text-destructive">{job.error || 'AI generation failed.'}</p> : null}
      {stale ? <p role="alert" className="text-sm text-destructive">Your reflections changed while these insights were generated. Regenerate to analyze the latest version.</p> : null}
      <ReviewAiInsights result={result} job={job} />
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function Reflection({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-2 text-sm font-semibold"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} className="w-full resize-y rounded-[var(--itu-radius-s)] border border-input bg-background p-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[var(--itu-radius-s)] border border-border bg-muted/25 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function formatMoney(value: unknown) {
  if (!value || typeof value !== 'object') return '—';
  return Object.entries(value as Record<string, unknown>).map(([currency, amount]) => `${currency} ${Number(amount).toLocaleString()}`).join(', ') || '—';
}

function formatDuration(value: unknown) {
  const seconds = typeof value === 'number' ? value : 0;
  return seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : `${Math.round(seconds / 60)}m`;
}
