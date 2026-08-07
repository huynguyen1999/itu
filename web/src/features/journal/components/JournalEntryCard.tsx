import { BookOpen, Calendar, Dumbbell, Receipt, Tag as TagIcon } from 'lucide-react';
import type { JournalEntry } from '../journal.types';
import { Link } from 'react-router-dom';

interface JournalEntryCardProps {
  entry: JournalEntry;
}

export function JournalEntryCard({ entry }: JournalEntryCardProps) {
  const isExpense = entry.kind === 'EXPENSE' && entry.expense;
  const isWorkout = entry.kind === 'WORKOUT' && entry.workout;
  const isWeeklyReview = entry.kind === 'WEEKLY_REVIEW';

  return (
    <Link
      to={`/journal/entry/${entry.id}`}
      className="group block p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900 transition-all shadow-lg hover:shadow-xl space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-md font-semibold text-[10px] uppercase tracking-wide ${
              entry.kind === 'NOTE'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : entry.kind === 'WEEKLY_REVIEW'
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                  : entry.kind === 'EXPENSE'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
            }`}
          >
            {entry.kind.replace('_', ' ')}
          </span>

          <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
            <Calendar className="w-3 h-3 text-slate-500" />
            {new Date(entry.entryDate).toLocaleDateString()}
          </span>
        </div>

        {entry.tags && entry.tags.length > 0 && (
          <div className="flex items-center gap-1">
            {entry.tags.slice(0, 2).map((t) => (
              <span key={t.id} className="text-[10px] font-medium text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded-md">
                #{t.name}
              </span>
            ))}
            {entry.tags.length > 2 && (
              <span className="text-[10px] text-slate-500">+{entry.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      <div className="font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors text-sm">
        {entry.title || 'Untitled Entry'}
      </div>

      {isExpense && (
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-300">
          <Receipt className="w-3.5 h-3.5" />
          <span className="font-bold">
            {Number(entry.expense!.amount).toLocaleString()} {entry.expense!.currency}
          </span>
          <span>• {entry.expense!.category}</span>
          {entry.expense!.merchant && <span>• {entry.expense!.merchant}</span>}
        </div>
      )}

      {isWorkout && (
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs font-mono text-sky-300">
          <Dumbbell className="w-3.5 h-3.5" />
          <span>{entry.workout!.exercises?.length || 0} exercises</span>
        </div>
      )}

      {isWeeklyReview && entry.weeklyReview?.summarySnapshot && (
        <div className="text-[11px] font-mono text-purple-300 bg-purple-500/10 px-2.5 py-1 rounded-xl border border-purple-500/20 inline-flex items-center gap-2">
          <span>
            {(entry.weeklyReview.summarySnapshot as any).tasks?.completed || 0} tasks completed
          </span>
          <span>• {(entry.weeklyReview.summarySnapshot as any).workouts?.sessions || 0} workouts</span>
        </div>
      )}

      {entry.contentMarkdown && (
        <p className="text-xs text-slate-400 line-clamp-2 font-mono bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
          {entry.contentMarkdown}
        </p>
      )}
    </Link>
  );
}
