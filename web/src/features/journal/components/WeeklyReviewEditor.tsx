import { useEffect } from 'react';
import { Calendar, CheckCircle2, Clock, Dumbbell, Flame, Layers, Receipt, Zap } from 'lucide-react';
import { useWeeklySummary } from '../journalQueries';
import type { JournalWeeklyReview } from '../journal.types';

interface WeeklyReviewEditorProps {
  weeklyReview?: JournalWeeklyReview | null;
  onChange: (weeklyReview: Partial<JournalWeeklyReview>) => void;
  entryDate?: string;
}

export function WeeklyReviewEditor({ weeklyReview, onChange, entryDate }: WeeklyReviewEditorProps) {
  const dateObj = entryDate ? new Date(entryDate) : new Date();
  const dayOfWeek = dateObj.getDay();
  const start = new Date(dateObj);
  start.setDate(dateObj.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const periodStart = weeklyReview?.periodStart || start.toISOString().split('T')[0];
  const periodEnd = weeklyReview?.periodEnd || end.toISOString().split('T')[0];

  const { data: summaryData } = useWeeklySummary(periodStart, periodEnd);

  const snapshot: any = weeklyReview?.summarySnapshot || summaryData || {};

  useEffect(() => {
    if (summaryData && (!weeklyReview?.summarySnapshot || Object.keys(weeklyReview.summarySnapshot).length === 0)) {
      onChange({
        periodStart,
        periodEnd,
        summarySnapshot: summaryData,
      });
    }
  }, [summaryData]);

  const tasksCompleted = snapshot.tasks?.completed ?? 0;
  const focusMinutes = snapshot.focus?.minutes ?? 0;
  const habitsCompleted = snapshot.habits?.completed ?? 0;
  const habitsScheduled = snapshot.habits?.scheduled ?? 0;
  const learningReviews = snapshot.learning?.reviews ?? 0;
  const workoutsCount = snapshot.workouts?.sessions ?? 0;
  const growthXp = snapshot.growth?.xpEarned ?? 0;
  const expensesMap = snapshot.expenses ?? {};

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-400">
            <Calendar className="w-4 h-4" />
            Weekly Snapshot ({periodStart} — {periodEnd})
          </div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Deterministic Stats
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tasks
            </div>
            <div className="text-base font-mono font-bold text-slate-100">{tasksCompleted} completed</div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-sky-400 font-medium">
              <Clock className="w-3.5 h-3.5" />
              Focus
            </div>
            <div className="text-base font-mono font-bold text-slate-100">
              {Math.floor(focusMinutes / 60)}h {focusMinutes % 60}m
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-400 font-medium">
              <Flame className="w-3.5 h-3.5" />
              Habits
            </div>
            <div className="text-base font-mono font-bold text-slate-100">
              {habitsCompleted} / {habitsScheduled}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-violet-400 font-medium">
              <Layers className="w-3.5 h-3.5" />
              Learning
            </div>
            <div className="text-base font-mono font-bold text-slate-100">{learningReviews} reviews</div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-blue-400 font-medium">
              <Dumbbell className="w-3.5 h-3.5" />
              Gym
            </div>
            <div className="text-base font-mono font-bold text-slate-100">{workoutsCount} workouts</div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-rose-400 font-medium">
              <Receipt className="w-3.5 h-3.5" />
              Expenses
            </div>
            <div className="text-xs font-mono font-bold text-slate-100">
              {Object.entries(expensesMap).map(([curr, val]) => (
                <div key={curr}>
                  {Number(val).toLocaleString()} {curr}
                </div>
              ))}
              {Object.keys(expensesMap).length === 0 && '0'}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1 sm:col-span-2">
            <div className="flex items-center gap-1.5 text-yellow-400 font-medium">
              <Zap className="w-3.5 h-3.5" />
              Growth XP Earned
            </div>
            <div className="text-base font-mono font-bold text-slate-100">+{growthXp} XP</div>
          </div>
        </div>
      </div>
    </div>
  );
}
