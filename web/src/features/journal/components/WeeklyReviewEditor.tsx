import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Dumbbell, Flame, Layers, Sparkles, Zap } from 'lucide-react';
import { useWeeklySummary } from '../journalQueries';
import type { JournalWeeklyReview } from '../journal.types';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';

interface WeeklyReviewEditorProps {
  weeklyReview?: Partial<JournalWeeklyReview> | null;
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

  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useWeeklySummary(periodStart, periodEnd);
  const snapshot: any = weeklyReview?.summarySnapshot || summaryData || {};

  const [wentWell, setWentWell] = useState(weeklyReview?.wentWellMarkdown || '');
  const [friction, setFriction] = useState(weeklyReview?.frictionMarkdown || '');
  const [nextWeek, setNextWeek] = useState(weeklyReview?.nextWeekMarkdown || '');

  const [experiment, setExperiment] = useState(() => {
    return (
      weeklyReview?.experimentSnapshot || {
        hypothesis: '',
        action: '',
        durationDays: 7,
        measure: '',
        startedOn: periodStart,
        status: 'ACTIVE',
      }
    );
  });

  useEffect(() => {
    if (summaryData && (!weeklyReview?.summarySnapshot || Object.keys(weeklyReview.summarySnapshot).length === 0)) {
      onChange({
        periodStart,
        periodEnd,
        summarySnapshot: summaryData,
        wentWellMarkdown: wentWell,
        frictionMarkdown: friction,
        nextWeekMarkdown: nextWeek,
        experimentSnapshot: experiment,
      });
    }
  }, [summaryData]);

  const updateFields = (field: string, val: any) => {
    let updatedWentWell = wentWell;
    let updatedFriction = friction;
    let updatedNextWeek = nextWeek;
    let updatedExp = experiment;

    if (field === 'wentWell') {
      setWentWell(val);
      updatedWentWell = val;
    } else if (field === 'friction') {
      setFriction(val);
      updatedFriction = val;
    } else if (field === 'nextWeek') {
      setNextWeek(val);
      updatedNextWeek = val;
    } else if (field === 'experiment') {
      setExperiment(val);
      updatedExp = val;
    }

    onChange({
      periodStart,
      periodEnd,
      summarySnapshot: snapshot,
      wentWellMarkdown: updatedWentWell,
      frictionMarkdown: updatedFriction,
      nextWeekMarkdown: updatedNextWeek,
      experimentSnapshot: updatedExp,
    });
  };

  const tasksCompleted = snapshot.tasks?.completed ?? 0;
  const focusMinutes = snapshot.focus?.minutes ?? 0;
  const habitsCompleted = snapshot.habits?.completed ?? 0;
  const habitsScheduled = snapshot.habits?.scheduled ?? 0;
  const learningReviews = snapshot.learning?.reviews ?? 0;
  const workoutsCount = snapshot.workouts?.sessions ?? 0;
  const growthXp = snapshot.growth?.xpEarned ?? 0;

  return (
    <div className="space-y-4">
      {/* Compact Top Summary Strip */}
      <Card>
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Calendar className="w-4 h-4" />
              Week Summary ({periodStart} — {periodEnd})
            </div>
            <span className="text-[11px] text-muted-foreground uppercase font-mono">Snapshot</span>
          </div>

          {isSummaryError ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--itu-radius-s)] bg-destructive/10 p-2 text-xs text-destructive"
              role="alert"
            >
              <span>Weekly summary could not be loaded.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetchSummary()}>
                Retry
              </Button>
            </div>
          ) : isSummaryLoading ? (
            <p className="text-xs text-muted-foreground" role="status">
              Loading summary…
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span>{tasksCompleted} tasks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>
                  {Math.floor(focusMinutes / 60)}h {focusMinutes % 60}m focus
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-primary" />
                <span>
                  Habits {habitsCompleted}/{habitsScheduled}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-primary" />
                <span>{workoutsCount} workouts</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span>{learningReviews} reviews</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span>+{growthXp} XP</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3-Column Main Reflection Table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="flex flex-col">
          <CardContent className="p-3.5 space-y-2 flex-1 flex flex-col">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              What went well?
            </h4>
            <p className="text-[11px] text-muted-foreground">What worked & should continue?</p>
            <textarea
              rows={6}
              value={wentWell}
              onChange={(e) => updateFields('wentWell', e.target.value)}
              placeholder="Highlights, achievements, positive moments..."
              className="min-h-[140px] w-full flex-1 resize-none rounded-[var(--itu-radius-s)] border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardContent className="p-3.5 space-y-2 flex-1 flex flex-col">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              What didn't work?
            </h4>
            <p className="text-[11px] text-muted-foreground">What created friction or failed?</p>
            <textarea
              rows={6}
              value={friction}
              onChange={(e) => updateFields('friction', e.target.value)}
              placeholder="Blockers, distractions, missed habits..."
              className="min-h-[140px] w-full flex-1 resize-none rounded-[var(--itu-radius-s)] border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardContent className="p-3.5 space-y-2 flex-1 flex flex-col">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              What will I test next week?
            </h4>
            <p className="text-[11px] text-muted-foreground">Tiny experiment for next cycle</p>
            <textarea
              rows={6}
              value={nextWeek}
              onChange={(e) => updateFields('nextWeek', e.target.value)}
              placeholder="Ideas, adjustments, next focus..."
              className="min-h-[140px] w-full flex-1 resize-none rounded-[var(--itu-radius-s)] border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
          </CardContent>
        </Card>
      </div>

      {/* Tiny Experiment Box */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              Next Tiny Experiment (Pact → Act → React → Impact)
            </div>
            <span className="text-[11px] uppercase tracking-wider font-mono text-primary font-semibold">
              {experiment.status || 'ACTIVE'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Hypothesis</label>
              <input
                type="text"
                placeholder="If I prepare tomorrow's top 3 tasks before bed..."
                value={experiment.hypothesis || ''}
                onChange={(e) => updateFields('experiment', { ...experiment, hypothesis: e.target.value })}
                className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Action / Pact</label>
              <input
                type="text"
                placeholder="Write top 3 tasks on paper every night at 10 PM"
                value={experiment.action || ''}
                onChange={(e) => updateFields('experiment', { ...experiment, action: e.target.value })}
                className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Duration (days)</label>
              <input
                type="number"
                value={experiment.durationDays || 7}
                onChange={(e) =>
                  updateFields('experiment', { ...experiment, durationDays: parseInt(e.target.value) || 7 })
                }
                className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Measure of success</label>
              <input
                type="text"
                placeholder="Did I start focused work within 15 minutes?"
                value={experiment.measure || ''}
                onChange={(e) => updateFields('experiment', { ...experiment, measure: e.target.value })}
                className="h-10 w-full rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
