import { LoaderCircle, Sparkles } from 'lucide-react';
import type { ReviewInsightsResult } from '../journal.types';
import type { AiJob } from '@/shared/api/types';
import { Card, CardContent } from '@/shared/ui/card';

export function ReviewAiInsights({ result, job }: { result?: ReviewInsightsResult | null; job?: AiJob | null }) {
  const isPending = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  const renderableResult = isReviewInsightsResult(result) ? result : null;

  return (
    <>
      {isPending ? (
        <Card role="status" aria-live="polite" aria-busy="true">
          <CardContent className="flex items-center gap-3 p-4 sm:p-5">
            <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">
                {job.status === 'QUEUED' ? 'AI insights queued' : 'Generating AI insights'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {job.status === 'QUEUED'
                  ? 'Waiting for the review worker to start.'
                  : 'Analyzing your saved activity and reflections.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {job?.status === 'COMPLETED' && !renderableResult ? (
        <p className="text-sm text-destructive" role="alert">
          AI generation finished, but no insights were returned. Try generating again.
        </p>
      ) : null}
      {!renderableResult ? null : (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wider">AI Insights</h2>
        </div>
        <div>
          <h3 className="font-semibold">{renderableResult.headline}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{renderableResult.summary}</p>
        </div>
        <div className="space-y-3">
          {renderableResult.insights.map((insight, index) => (
            <article key={`${insight.title}-${index}`} className="rounded-[var(--itu-radius-s)] border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">{insight.title}</h3>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{insight.confidence}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight.body}</p>
              {insight.evidence?.length ? (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium">Evidence</summary>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {insight.evidence.map((evidence) => <li key={evidence.id}>{evidence.label}</li>)}
                  </ul>
                </details>
              ) : null}
            </article>
          ))}
        </div>
        {renderableResult.attentionNext.length ? (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Worth noticing next</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {renderableResult.attentionNext.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function isReviewInsightsResult(value: unknown): value is ReviewInsightsResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as ReviewInsightsResult;
  return typeof result.headline === 'string'
    && typeof result.summary === 'string'
    && Array.isArray(result.insights)
    && Array.isArray(result.attentionNext);
}
