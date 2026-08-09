import { Calendar, FileText } from 'lucide-react';
import type { JournalEntry } from '../journal.types';
import { formatDateStringToLocalDisplay } from '../journalDate';
import { Link } from 'react-router-dom';

interface JournalEntryCardProps {
  entry: JournalEntry;
}

export function JournalEntryCard({ entry }: JournalEntryCardProps) {
  const kindLabel = formatKind(entry.kind);
  const preview = stripMarkdown(entry.contentMarkdown);
  const isWeeklyReview = entry.kind === 'WEEKLY_REVIEW';

  return (
    <Link
      to={`/journal/entry/${entry.id}`}
      aria-label={`Open ${entry.title || 'untitled entry'}`}
      className="group block rounded-[var(--itu-radius-m)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <article className="h-full rounded-[var(--itu-radius-m)] border border-border bg-card p-4 shadow-[var(--itu-shadow-card)] transition-[border-color,transform,box-shadow] duration-150 group-hover:-translate-y-0.5 group-hover:border-[var(--itu-teal-400)] group-hover:shadow-[var(--itu-shadow-pop)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-mono font-bold uppercase tracking-wide text-primary">
              <FileText className="h-3 w-3" aria-hidden="true" />
              {kindLabel}
            </span>
            <span
              className="flex min-w-0 items-center gap-1 text-[11px] font-mono text-muted-foreground"
              title={formatDateStringToLocalDisplay(entry.entryDate)}
            >
              <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{formatShortDate(entry.entryDate)}</span>
            </span>
          </div>
          <span
            className="shrink-0 text-xs text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            →
          </span>
        </div>

        <h3 className="mt-4 line-clamp-2 text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
          {entry.title || 'Untitled entry'}
        </h3>

        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{preview}</p>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
          {isWeeklyReview && entry.weeklyReview?.summarySnapshot?.tasks && (
            <span className="rounded-full border border-border bg-muted/50 px-2 py-1">
              {entry.weeklyReview.summarySnapshot.tasks.completed} tasks completed
            </span>
          )}
          {entry.tags?.slice(0, 2).map((tag) => (
            <span key={tag.id} className="rounded-full border border-border bg-muted/50 px-2 py-1">
              #{tag.name}
            </span>
          ))}
          {!!entry.tags && entry.tags.length > 2 && (
            <span className="rounded-full border border-border bg-muted/50 px-2 py-1">+{entry.tags.length - 2}</span>
          )}
        </div>
      </article>
    </Link>
  );
}

function formatKind(kind: JournalEntry['kind']) {
  return kind.replace('_', ' ').toLowerCase();
}

function formatShortDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function stripMarkdown(value: string) {
  return (
    value
      .replace(/[#*_>`\[\]]/g, '')
      .replace(/\n+/g, ' ')
      .trim() || 'An empty page, ready for the next line.'
  );
}
