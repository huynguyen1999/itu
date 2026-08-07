import { Calendar, Dumbbell, Receipt } from 'lucide-react';
import type { JournalEntry } from '../journal.types';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/shared/ui/card';

interface JournalEntryCardProps {
  entry: JournalEntry;
}

export function JournalEntryCard({ entry }: JournalEntryCardProps) {
  const isExpense = entry.kind === 'EXPENSE' && entry.expense;
  const isWorkout = entry.kind === 'WORKOUT' && entry.workout;
  const isWeeklyReview = entry.kind === 'WEEKLY_REVIEW';

  return (
    <Link to={`/journal/entry/${entry.id}`} className="group block">
      <Card className="transition-all hover:border-primary/50">
        <CardContent className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md font-semibold text-[10px] uppercase tracking-wide bg-primary/10 text-primary border border-primary/20">
                {entry.kind.replace('_', ' ')}
              </span>

              <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                {new Date(entry.entryDate).toLocaleDateString()}
              </span>
            </div>

            {entry.tags && entry.tags.length > 0 && (
              <div className="flex items-center gap-1">
                {entry.tags.slice(0, 2).map((t) => (
                  <span key={t.id} className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                    #{t.name}
                  </span>
                ))}
                {entry.tags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{entry.tags.length - 2}</span>
                )}
              </div>
            )}
          </div>

          <div className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm">
            {entry.title || 'Untitled Entry'}
          </div>

          {isExpense && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-muted text-xs font-mono text-foreground">
              <Receipt className="w-3.5 h-3.5 text-primary" />
              <span className="font-bold">
                {Number(entry.expense!.amount).toLocaleString()} {entry.expense!.currency}
              </span>
              <span>• {entry.expense!.category}</span>
              {entry.expense!.merchant && <span>• {entry.expense!.merchant}</span>}
            </div>
          )}

          {isWorkout && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-muted text-xs font-mono text-foreground">
              <Dumbbell className="w-3.5 h-3.5 text-primary" />
              <span>{entry.workout!.exercises?.length || 0} exercises</span>
            </div>
          )}

          {isWeeklyReview && entry.weeklyReview?.summarySnapshot && (
            <div className="text-[11px] font-mono text-foreground bg-muted px-2.5 py-1 rounded-md inline-flex items-center gap-2">
              <span>
                {(entry.weeklyReview.summarySnapshot as any).tasks?.completed || 0} tasks completed
              </span>
              <span>• {(entry.weeklyReview.summarySnapshot as any).workouts?.sessions || 0} workouts</span>
            </div>
          )}

          {entry.contentMarkdown && (
            <p className="text-xs text-muted-foreground line-clamp-2 font-mono bg-muted/40 p-2 rounded-md border border-border/40">
              {entry.contentMarkdown}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
