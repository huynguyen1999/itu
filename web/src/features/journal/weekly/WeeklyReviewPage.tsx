import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, CheckCircle2, Clock, Dumbbell, Flame, Sparkles, Trophy, Wallet, Zap } from 'lucide-react';
import { useJournalEntry, useWeeklySummary } from '../journalQueries';
import { useCreateJournalEntryMutation, useUpdateJournalEntryMutation } from '../journalMutations';
import { JournalMarkdownEditor } from '../components/JournalMarkdownEditor';
import { createUlid } from '@/shared/sync/syncIdentity';

export function WeeklyReviewPage() {
  const navigate = useNavigate();
  const { entryId } = useParams();

  const isNew = !entryId || entryId === 'new';
  const { data: existingEntry, isLoading } = useJournalEntry(entryId || '', isNew);

  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();

  const [id, setId] = useState(entryId || createUlid());
  const [title, setTitle] = useState('Weekly Review — Week 32');

  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split('T')[0];
  });

  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 7);
    return d.toISOString().split('T')[0];
  });

  const { data: weeklyMetrics } = useWeeklySummary(periodStart, periodEnd);

  const [wentWell, setWentWell] = useState('');
  const [friction, setFriction] = useState('');
  const [nextWeek, setNextWeek] = useState('');

  const [experimentHypothesis, setExperimentHypothesis] = useState('');
  const [experimentAction, setExperimentAction] = useState('');
  const [experimentSuccess, setExperimentSuccess] = useState('');

  const [contentMarkdown, setContentMarkdown] = useState('');

  useEffect(() => {
    if (existingEntry?.weeklyReview) {
      setTitle(existingEntry.title || 'Weekly Review');
      setWentWell(existingEntry.weeklyReview.wentWellMarkdown || '');
      setFriction(existingEntry.weeklyReview.frictionMarkdown || '');
      setNextWeek(existingEntry.weeklyReview.nextWeekMarkdown || '');
      setContentMarkdown(existingEntry.contentMarkdown || '');

      if (existingEntry.weeklyReview.experimentSnapshot) {
        const snap = existingEntry.weeklyReview.experimentSnapshot;
        setExperimentHypothesis(snap.hypothesis || '');
        setExperimentAction(snap.action || '');
        setExperimentSuccess(snap.success || '');
      }
    }
  }, [existingEntry]);

  const handleSave = async () => {
    const payloadReview = {
      periodStart,
      periodEnd,
      wentWellMarkdown: wentWell,
      frictionMarkdown: friction,
      nextWeekMarkdown: nextWeek,
      experimentSnapshot: {
        hypothesis: experimentHypothesis,
        action: experimentAction,
        success: experimentSuccess,
      },
      summarySnapshot: weeklyMetrics || {},
    };

    if (isNew) {
      await createMutation.mutateAsync({
        id,
        kind: 'WEEKLY_REVIEW',
        title: title || 'Weekly Review',
        contentMarkdown,
        entryDate: periodStart,
        weeklyReview: payloadReview,
      });
    } else {
      await updateMutation.mutateAsync({
        id,
        title,
        contentMarkdown,
        weeklyReview: payloadReview,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header & Week Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-2xl font-bold tracking-tight text-foreground bg-transparent outline-none"
              />
              <p className="text-xs text-muted-foreground">Reflection & Tiny Experiments</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-card border border-border/80 rounded-xl px-3 py-1.5 text-xs text-foreground shadow-sm">
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="bg-transparent text-foreground outline-none"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="bg-transparent text-foreground outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            className="px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-md"
          >
            Save Review
          </button>
        </div>
      </div>

      {/* Automatic Metrics Summary Snapshot */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Calculated Weekly Metrics
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Tasks
            </span>
            <p className="text-base font-bold text-foreground">
              {weeklyMetrics?.tasks?.completed ?? 28} completed
            </p>
          </div>

          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-500" /> Focus Time
            </span>
            <p className="text-base font-bold text-foreground">
              {weeklyMetrics?.focus?.minutes ? `${Math.round(weeklyMetrics.focus.minutes / 60)}h ${weeklyMetrics.focus.minutes % 60}m` : '12h 20m'}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" /> Habits
            </span>
            <p className="text-base font-bold text-foreground">
              {weeklyMetrics?.habits?.completed ?? 18} / {weeklyMetrics?.habits?.scheduled ?? 21}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Dumbbell className="w-3.5 h-3.5 text-purple-500" /> Training
            </span>
            <p className="text-base font-bold text-foreground">
              {weeklyMetrics?.workouts?.sessions ?? 3} workouts
            </p>
          </div>

          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-teal-500" /> Spending
            </span>
            <p className="text-base font-bold text-foreground">
              ₫{weeklyMetrics?.expenses?.VND ? weeklyMetrics.expenses.VND.toLocaleString() : '2,850,000'}
            </p>
          </div>
        </div>
      </div>

      {/* 3 Reflection Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* What Went Well */}
        <div className="rounded-2xl border border-emerald-500/30 bg-card p-4 space-y-2 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <Trophy className="w-4 h-4" />
            What went well
          </div>
          <textarea
            placeholder="Wins, achievements, positive habits..."
            value={wentWell}
            onChange={(e) => setWentWell(e.target.value)}
            rows={6}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none resize-none border-0"
          />
        </div>

        {/* What Didn't Work */}
        <div className="rounded-2xl border border-amber-500/30 bg-card p-4 space-y-2 shadow-sm">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <Flame className="w-4 h-4" />
            What didn't work
          </div>
          <textarea
            placeholder="Friction points, missed habits, distractions..."
            value={friction}
            onChange={(e) => setFriction(e.target.value)}
            rows={6}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none resize-none border-0"
          />
        </div>

        {/* What I'll Try Next Week */}
        <div className="rounded-2xl border border-blue-500/30 bg-card p-4 space-y-2 shadow-sm">
          <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            What I'll try next week
          </div>
          <textarea
            placeholder="Adjustments, new routines, focused targets..."
            value={nextWeek}
            onChange={(e) => setNextWeek(e.target.value)}
            rows={6}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none resize-none border-0"
          />
        </div>
      </div>

      {/* Tiny Experiment Card */}
      <div className="rounded-2xl border border-emerald-500/40 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Tiny Experiment
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground">Hypothesis</label>
            <input
              type="text"
              placeholder="I believe that..."
              value={experimentHypothesis}
              onChange={(e) => setExperimentHypothesis(e.target.value)}
              className="w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground">Action</label>
            <input
              type="text"
              placeholder="For the next 7 days I will..."
              value={experimentAction}
              onChange={(e) => setExperimentAction(e.target.value)}
              className="w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-muted-foreground">Success Criteria</label>
            <input
              type="text"
              placeholder="Success means..."
              value={experimentSuccess}
              onChange={(e) => setExperimentSuccess(e.target.value)}
              className="w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Narrative Markdown Reflection */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Detailed Markdown Reflection
        </h3>
        <JournalMarkdownEditor
          value={contentMarkdown}
          onChange={setContentMarkdown}
          onSave={() => void handleSave()}
          placeholder="Write freeform reflection, takeaways, deep thoughts..."
          minHeight="240px"
          frameless={false}
        />
      </div>
    </div>
  );
}
