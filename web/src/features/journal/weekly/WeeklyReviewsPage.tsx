import { Calendar, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useJournalEntries } from '../journalQueries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/PageHeader';

export function WeeklyReviewsPage() {
  const navigate = useNavigate();
  const { data: reviews = [], isLoading } = useJournalEntries({ kind: 'WEEKLY_REVIEW' });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-20">
      <PageHeader
        kicker="Weekly writing"
        title="Weekly reviews"
        description="Review the week, keep the lesson, and choose what comes next."
      >
        <Button type="button" onClick={() => navigate('/journal/weekly/new')} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New review
        </Button>
      </PageHeader>

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">Loading weekly reviews…</p>
      ) : reviews.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Calendar className="h-8 w-8 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">No weekly reviews yet.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Start with the current week and build the thread over time.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/journal/weekly/new')}>
            Create this week’s review
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews.map((review) => (
            <button
              key={review.id}
              type="button"
              onClick={() => navigate(`/journal/weekly/${review.id}`)}
              className="flex w-full items-center justify-between gap-4 rounded-[var(--itu-radius-m)] border border-border bg-card p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{review.title || 'Weekly review'}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{review.entryDate.slice(0, 10)}</span>
              </span>
              <span className="shrink-0 text-xs text-primary">Open review →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
