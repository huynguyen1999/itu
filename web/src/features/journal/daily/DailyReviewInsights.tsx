import { ChevronDown, LoaderCircle, Sparkles } from 'lucide-react';
import type { ReviewInsightsResult } from '../journal.types';
import { Button } from '@/shared/ui/button';

export function DailyReviewInsights({
  insights,
  isOpen,
  onToggle,
  isGenerating,
  aiError,
  stale,
  onGenerate,
  isNew,
  isSaving,
  reviewPending,
  isOffline,
}: {
  insights: ReviewInsightsResult | null;
  isOpen: boolean;
  onToggle: () => void;
  isGenerating: boolean;
  aiError: string | null;
  stale: boolean;
  onGenerate: () => void;
  isNew: boolean;
  isSaving: boolean;
  reviewPending: boolean;
  isOffline: boolean;
}) {
  const canGenerate = !isNew && !isSaving && !reviewPending && !isOffline;

  return (
    <aside className="space-y-4 lg:sticky lg:top-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-base font-normal text-foreground">AI insights</h2>
            <p className="truncate text-xs text-muted-foreground">
              {insights?.insights?.length
                ? `${insights.insights.length} findings from today's data`
                : 'Synthesis from daily data & reflections'}
            </p>
          </div>
          {insights ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <span>{isOpen ? 'Hide' : 'Show'}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
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
          <p className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive" role="alert">
            {aiError}
          </p>
        ) : null}

        {stale ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            <span className="font-bold">⚠</span>
            <span>Reflections changed since insights were generated — regenerate for latest analysis.</span>
          </div>
        ) : null}

        {insights && isOpen ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-1 border-b border-border/50 pb-3">
              <h3 className="text-xs font-semibold leading-snug text-foreground">{insights.headline}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{insights.summary}</p>
            </div>

            <div className="space-y-3">
              {insights.insights.map((insight, index) => (
                <div key={`${insight.title}-${index}`} className="border-b border-border/40 pb-3 last:border-b-0">
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
                        {insight.evidence.map((evidence) => (
                          <li key={evidence.id}>{evidence.label}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>

            {insights.attentionNext?.length ? (
              <div className="border-t border-border/60 pt-3">
                <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Worth noticing next
                </h4>
                <ul className="space-y-1.5">
                  {insights.attentionNext.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="font-bold text-primary">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : !insights && !isGenerating ? (
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
              onClick={onGenerate}
              disabled={!canGenerate}
              className="w-full text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Generate AI Insights
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
