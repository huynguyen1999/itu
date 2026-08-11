import { useEffect, useState } from 'react';
import { ArrowLeft, Filter, Search, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useJournalEntries, useJournalTags } from './journalQueries';
import { JournalEntryCard } from './components/JournalEntryCard';
import type { JournalEntryKind } from './journal.types';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';

export function JournalSearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: tags = [], isLoading: isTagsLoading, isError: isTagsError, refetch: refetchTags } = useJournalTags();

  const [kind, setKind] = useState<JournalEntryKind | undefined>(undefined);
  const [tagId, setTagId] = useState<string | undefined>(undefined);
  const queryParam = searchParams.get('query') || '';
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
  const [query, setQuery] = useState(queryParam);
  const [startDate, setStartDate] = useState(startDateParam);
  const [endDate, setEndDate] = useState(endDateParam);

  useEffect(() => {
    setQuery(queryParam);
    setStartDate(startDateParam);
    setEndDate(endDateParam);
  }, [queryParam, startDateParam, endDateParam]);

  const filter = {
    kind,
    tagId,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    query: query.trim() || undefined,
  };

  const { data: entries = [], isLoading, isError, refetch } = useJournalEntries(filter);
  const activeEntries = entries.filter((entry) => !entry.deletedAt);

  const clearFilters = () => {
    setKind(undefined);
    setTagId(undefined);
    setStartDate('');
    setEndDate('');
    setQuery('');
  };

  const hasActiveFilters = Boolean(kind || tagId || startDate || endDate || query.trim());

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/journal')} className="gap-1 px-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Journal
        </Button>

        {hasActiveFilters && (
          <Button type="button" variant="link" size="sm" onClick={clearFilters} className="gap-1 text-destructive">
            <X className="h-3.5 w-3.5" />
            Clear Filters
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search entries by title, content, or attachment file..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search journal entries"
              className="h-11 w-full rounded-[var(--itu-radius-s)] border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="mr-1 flex items-center gap-1 font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Filters:
            </div>

            <select
              value={kind || ''}
              onChange={(e) => setKind((e.target.value as JournalEntryKind) || undefined)}
              aria-label="Filter by entry kind"
              className="h-10 rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All Kinds</option>
              <option value="NOTE">NOTE</option>
              <option value="WEEKLY_REVIEW">WEEKLY REVIEW</option>
            </select>

            <select
              value={tagId || ''}
              onChange={(e) => setTagId(e.target.value || undefined)}
              aria-label="Filter by tag"
              disabled={isTagsLoading || isTagsError}
              className="h-10 rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">All Tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  #{tag.name}
                </option>
              ))}
            </select>

            <label className="inline-flex min-h-10 items-center gap-1.5 text-muted-foreground">
              <span>From</span>
              <input
                type="date"
                aria-label="Start date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="inline-flex min-h-10 items-center gap-1.5 text-muted-foreground">
              <span>To</span>
              <input
                type="date"
                aria-label="End date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            {isTagsError && (
              <div className="flex w-full flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
                Tags could not be loaded.
                <Button type="button" variant="outline" size="sm" onClick={() => void refetchTags()}>
                  Retry tags
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Results ({activeEntries.length})
        </div>

        {isLoading ? (
          <div
            className="rounded-[var(--itu-radius-m)] border border-border bg-card p-6 text-sm text-muted-foreground"
            role="status"
          >
            Searching entries…
          </div>
        ) : isError ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--itu-radius-m)] border border-destructive/25 bg-destructive/10 p-5 text-sm text-destructive"
            role="alert"
          >
            <span>Journal entries could not be loaded.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : activeEntries.length === 0 ? (
          <Card>
            <CardContent className="space-y-2 p-8 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-semibold text-foreground">No matching entries found</div>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or search query.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeEntries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
