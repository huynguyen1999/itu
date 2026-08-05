import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpenText, History, LibraryBig, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/shared/api/client';
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

const learningActions = [
  {
    to: '/learn/decks',
    icon: LibraryBig,
    title: 'Browse your library',
    description: 'Open a deck, add cards, or choose what you want to study next.',
  },
  {
    to: '/learn/review',
    icon: PlayCircle,
    title: 'Start a review',
    description: 'Work through the cards currently scheduled for active recall.',
  },
  {
    to: '/learn/history',
    icon: History,
    title: 'Open learning history',
    description: 'Return to previous sessions and inspect the cards you reviewed.',
  },
] as const;

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard() });

  if (dashboard.isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading learning overview">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const dueCount = dashboard.data?.dueCount ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 animate-in fade-in duration-500">
      <header className="border-b pb-7">
        <p className="itu-eyebrow">Learning workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">Overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose the next learning action without losing your place in reports or charts.
        </p>
      </header>

      <Card className="itu-gradient-card overflow-hidden border-none shadow-xl">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="space-y-2">
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-[rgba(237,243,240,0.65)]">
              Today’s review
            </p>
            <h2 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {dueCount > 0 ? `${dueCount} cards are ready` : 'You’re all caught up'}
            </h2>
            <p className="max-w-xl text-sm leading-6" style={{ color: 'rgba(237,243,240,0.7)' }}>
              {dueCount > 0
                ? 'Reviewing now keeps your next session manageable.'
                : 'There are no scheduled reviews waiting. Add cards or open a deck when you are ready.'}
            </p>
          </div>
          <Link
            to={dueCount > 0 ? '/learn/review' : '/learn/decks'}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border-none px-6 py-3 font-body font-semibold no-underline"
            style={{
              background: 'rgba(237,243,240,0.14)',
              color: '#EDF3F0',
              fontSize: '14px',
              backdropFilter: 'blur(4px)',
            }}
          >
            {dueCount > 0 ? 'Start review' : 'Browse decks'}
            <ArrowRight aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>

      <section aria-labelledby="learning-actions-heading">
        <div className="mb-3">
          <h2 id="learning-actions-heading" className="text-lg font-semibold tracking-tight">
            Continue learning
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Pick up where you want to continue.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {learningActions.map(({ to, icon: Icon, title, description }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-xl border bg-card p-5 shadow-[var(--shadow-soft)] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {dashboard.isError && (
        <div
          className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <BookOpenText className="h-5 w-5 shrink-0" aria-hidden="true" />
          Review availability could not be loaded. You can still browse decks or open learning history.
        </div>
      )}
    </div>
  );
}
