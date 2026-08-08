import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, Dumbbell, Flame, Sparkles, Trophy, Wallet, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import {
  JournalSettingsPopover,
  DEFAULT_JOURNAL_DISPLAY_SETTINGS,
  type JournalDisplaySettings,
} from './JournalSettingsPopover';
import type { JournalPreferences } from '@/shared/api/preferencesApi';
import { useJournalEntries } from './journalQueries';

export function JournalOverviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [journalDisplaySettings, setJournalDisplaySettings] = useState<JournalDisplaySettings>(DEFAULT_JOURNAL_DISPLAY_SETTINGS);
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateJournalPref = useMutation({
    mutationFn: (patch: Partial<JournalPreferences>) => api.updateJournalPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const { data: entries = [], isLoading } = useJournalEntries();

  const todayStr = new Date().toISOString().split('T')[0];

  // Daily notes
  const dailyNote = entries.find((e) => e.kind === 'NOTE' && e.entryDate === todayStr);

  // Today's expenses
  const todayExpenses = entries.filter((e) => e.kind === 'EXPENSE' && e.entryDate === todayStr && e.expense);
  const todaySpent = todayExpenses.reduce((acc, e) => acc + (Number(e.expense?.amount) || 0), 0);

  // Today's workout
  const todayWorkout = entries.find((e) => e.kind === 'WORKOUT' && e.entryDate === todayStr && e.workout);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <PageHeader
        kicker="Journal & Daily Notes"
        title="Journal"
        description="Your cross-domain activity and personal operating system"
      >
        <FeatureSettingsButton title="Journal settings">
          <JournalSettingsPopover
            preferences={userPreferences.data?.journal}
            displaySettings={journalDisplaySettings}
            onChangePreferences={(patch) => updateJournalPref.mutate(patch)}
            onChangeDisplay={(patch) => setJournalDisplaySettings((current) => ({ ...current, ...patch }))}
          />
        </FeatureSettingsButton>
      </PageHeader>

      {/* TODAY Summary Cards Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Today
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Daily Note Card */}
          <div
            onClick={() => navigate(dailyNote ? `/journal/notes/${dailyNote.id}` : `/journal/daily/${todayStr}`)}
            className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:border-emerald-500/40 transition-all cursor-pointer space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
                <Calendar className="w-4 h-4" />
                Daily Note
              </div>
              <span className="text-[10px] text-muted-foreground">{todayStr}</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {dailyNote ? dailyNote.title : 'Start Today\'s Daily Note'}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {dailyNote?.contentMarkdown || 'Click to write reflections, daily goals, and notes...'}
            </p>
          </div>

          {/* Money Card */}
          <div
            onClick={() => navigate('/journal/money')}
            className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:border-emerald-500/40 transition-all cursor-pointer space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
                <Wallet className="w-4 h-4" />
                Money
              </div>
              <span className="text-[10px] text-muted-foreground">{todayExpenses.length} transactions</span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              ₫{todaySpent.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Spent today across all accounts</p>
          </div>

          {/* Gym Card */}
          <div
            onClick={() => navigate(todayWorkout ? `/journal/gym/active/${todayWorkout.id}` : '/journal/gym')}
            className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:border-emerald-500/40 transition-all cursor-pointer space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
                <Dumbbell className="w-4 h-4" />
                Training
              </div>
              <span className="text-[10px] text-muted-foreground">Gym</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {todayWorkout ? todayWorkout.title : 'Push A Routine'}
            </p>
            <p className="text-xs text-muted-foreground">
              {todayWorkout ? 'Workout completed' : 'Ready for training session'}
            </p>
          </div>
        </div>
      </div>

      {/* THIS WEEK Overview */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            This Week Progress
          </span>
          <button
            type="button"
            onClick={() => navigate('/journal/weekly')}
            className="flex items-center gap-1 text-xs font-bold text-emerald-400 hover:underline"
          >
            Weekly Review Ready <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> Focus Time
            </span>
            <p className="text-base font-bold text-foreground">12h 20m</p>
          </div>

          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Habits Adherence
            </span>
            <p className="text-base font-bold text-foreground">82%</p>
          </div>

          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Dumbbell className="w-3.5 h-3.5 text-purple-400" /> Workouts
            </span>
            <p className="text-base font-bold text-foreground">3 sessions</p>
          </div>

          <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-teal-400" /> Spending
            </span>
            <p className="text-base font-bold text-foreground">₫2,850,000</p>
          </div>
        </div>
      </div>

      {/* Recent Notes Library Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Notes & Reflections
          </h3>
          <button
            type="button"
            onClick={() => navigate('/journal/notes')}
            className="text-xs font-medium text-emerald-400 hover:underline"
          >
            All Notes →
          </button>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-sm">
          {entries.slice(0, 5).map((entry) => (
            <div
              key={entry.id}
              onClick={() => {
                if (entry.kind === 'NOTE') navigate(`/journal/notes/${entry.id}`);
                else if (entry.kind === 'EXPENSE') navigate('/journal/money');
                else if (entry.kind === 'WORKOUT') navigate(`/journal/gym/active/${entry.id}`);
                else if (entry.kind === 'WEEKLY_REVIEW') navigate(`/journal/weekly/${entry.id}`);
              }}
              className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{entry.contentMarkdown || 'No content'}</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                {entry.kind}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
