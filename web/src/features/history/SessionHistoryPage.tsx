import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CalendarDays, MessageSquareText } from 'lucide-react';
import { api } from '../../shared/api/client';
import { MarkdownPreview } from '../../shared/markdown/MarkdownPreview';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

export function SessionHistoryPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const sessions = useInfiniteQuery({
    queryKey: ['session-history-page'],
    queryFn: ({ pageParam }) => api.sessionHistory({ cursor: pageParam, limit: 12 }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });
  const items = sessions.data?.pages.flatMap((page) => page.data) ?? [];
  const selectedId = selectedSessionId ?? items[0]?.id ?? null;
  const details = useQuery({
    queryKey: ['session-details', selectedId],
    queryFn: () => api.sessionDetails(selectedId!),
    enabled: Boolean(selectedId),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <p className="text-sm font-medium text-primary">Study archive</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Session history</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse completed sessions and saved AI feedback.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessions.isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No completed study sessions yet.</p>
            ) : (
              items.map((session) => (
                <button
                  key={session.id}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedId === session.id ? 'border-primary bg-primary/5' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <p className="text-sm font-semibold text-slate-900">{session.deckTitle || 'All decks'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(session.completedAt)}</p>
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    {session.correctRate}% remembered · {session.reviewed} cards · rating {session.rating ?? '-'}/10
                  </p>
                </button>
              ))
            )}
            {sessions.hasNextPage && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => sessions.fetchNextPage()}
                disabled={sessions.isFetchingNextPage}
              >
                {sessions.isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Session details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {details.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !details.data ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Select a session to inspect it.</p>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-4">
                  <Metric label="Remembered" value={`${details.data.correctRate}%`} />
                  <Metric label="Cards" value={`${details.data.reviewed}`} />
                  <Metric label="Correct" value={`${details.data.correct}`} />
                  <Metric label="Rating" value={`${details.data.rating ?? '-'}/10`} />
                </div>

                {details.data.feedback ? (
                  <div className="rounded-lg border bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-primary">Saved AI feedback</p>
                    <MarkdownPreview value={details.data.feedback.summary} className="prose-sm mt-2 text-slate-800" />
                    {details.data.feedback.nextSteps.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase text-slate-500">Next steps</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                          {details.data.feedback.nextSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                    No AI feedback was saved for this session.
                  </p>
                )}

                <div className="space-y-3">
                  {details.data.reviews.map((review, index) => (
                    <div key={`${review.cardId}-${index}`} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">Card {index + 1}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {review.grade}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <RichTextBlock label="Prompt" html={review.promptRichText} />
                        <RichTextBlock label="Answer" html={review.answerRichText} />
                      </div>
                      {review.userAnswer && (
                        <p className="mt-3 rounded-md bg-slate-50 p-2 text-sm text-slate-700">
                          <span className="font-semibold">Your answer:</span> {review.userAnswer}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function RichTextBlock({ label, html }: { label: string; html: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <MarkdownPreview value={html} className="prose-sm mt-1 text-slate-800" />
    </div>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Completed';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
