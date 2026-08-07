import { useState } from 'react';
import {
  BookOpen,
  Calendar,
  Dumbbell,
  FileText,
  Plus,
  Receipt,
  Search,
  Sparkles,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useJournalEntries, useJournalTemplates } from './journalQueries';
import { useCreateJournalEntryMutation } from './journalMutations';
import { JournalEntryCard } from './components/JournalEntryCard';
import { createUlid } from '../../shared/sync/syncIdentity';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

interface JournalDashboardProps {
  defaultKind?: 'NOTE' | 'WEEKLY_REVIEW' | 'EXPENSE' | 'WORKOUT';
}

export function JournalDashboard({ defaultKind }: JournalDashboardProps) {
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = useJournalEntries(
    defaultKind ? { kind: defaultKind } : undefined,
  );
  const { data: templates = [] } = useJournalTemplates();
  const createMutation = useCreateJournalEntryMutation();

  const todayStr = new Date().toISOString().split('T')[0];
  const todayNote = entries.find((e) => e.entryDate.startsWith(todayStr) && e.kind === 'NOTE');

  const filteredEntries = defaultKind ? entries.filter((e) => e.kind === defaultKind) : entries;
  const recentNotes = filteredEntries.slice(0, 6);

  const expensesThisWeek = entries
    .filter((e) => e.kind === 'EXPENSE' && e.expense)
    .reduce((acc, e) => acc + Number(e.expense?.amount || 0), 0);

  const lastWorkout = entries.find((e) => e.kind === 'WORKOUT' && e.workout);

  const handleStartDailyNote = async () => {
    if (todayNote) {
      navigate(`/journal/entry/${todayNote.id}`);
      return;
    }
    const newId = createUlid();
    const dailyTpl = templates.find((t) => t.name.toLowerCase().includes('daily'));
    const defaultBody = dailyTpl
      ? dailyTpl.bodyMarkdown
      : `## Today\n\n## What went well?\n\n## What could be better?\n\n## Tomorrow`;

    await createMutation.mutateAsync({
      id: newId,
      kind: 'NOTE',
      title: `Daily Note — ${new Date().toLocaleDateString()}`,
      contentMarkdown: defaultBody,
      entryDate: todayStr,
    });
    navigate(`/journal/entry/${newId}`);
  };

  const handleCreateNew = (kind: 'NOTE' | 'WEEKLY_REVIEW' | 'EXPENSE' | 'WORKOUT') => {
    const newId = createUlid();
    const titleMap = {
      NOTE: `Note — ${new Date().toLocaleDateString()}`,
      WEEKLY_REVIEW: `Weekly Review — Week ${getWeekNumber(new Date())}`,
      EXPENSE: `Expense Log — ${new Date().toLocaleDateString()}`,
      WORKOUT: `Gym Workout — ${new Date().toLocaleDateString()}`,
    };
    navigate(`/journal/entry/${newId}`, {
      state: { isNew: true, kind, title: titleMap[kind], entryDate: todayStr },
    });
  };

  return (
    <div className="space-y-6">
      {/* Dashboard Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-card border border-border">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            {defaultKind === 'NOTE'
              ? 'Daily Notes & Diary'
              : defaultKind === 'WEEKLY_REVIEW'
              ? 'Weekly Reviews'
              : defaultKind === 'EXPENSE'
              ? 'Money & Expenses'
              : defaultKind === 'WORKOUT'
              ? 'Gym Workouts'
              : 'Journal Overview'}
          </h1>
          <p className="text-xs text-muted-foreground">
            Personal productivity timeline, daily reflections, financial logs, and training history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/journal/notes')}
            className="gap-1.5"
          >
            <Search className="w-4 h-4" />
            Search
          </Button>

          <Button
            size="sm"
            onClick={() => handleCreateNew(defaultKind || 'NOTE')}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Grid Dashboard Widgets */}
      {!defaultKind && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* TODAY DAILY NOTE CARD */}
          <Card className="flex flex-col justify-between">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-primary uppercase tracking-wider text-[10px]">
                  TODAY'S REFLECTION
                </span>
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <CardTitle className="text-base">{todayNote ? todayNote.title : 'Daily Note'}</CardTitle>
              <CardDescription className="text-xs line-clamp-2">
                {todayNote
                  ? todayNote.contentMarkdown || 'Empty daily reflection...'
                  : "Capture today's highlights, learning, and progress."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center gap-1.5"
                onClick={() => void handleStartDailyNote()}
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {todayNote ? 'Open Daily Note →' : "Start Today's Reflection →"}
              </Button>
            </CardContent>
          </Card>

          {/* EXPENSES WIDGET */}
          <Card className="flex flex-col justify-between">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-primary uppercase tracking-wider text-[10px]">
                  MONEY / EXPENSES
                </span>
                <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                {expensesThisWeek.toLocaleString()} VND
              </div>
              <CardDescription className="text-xs">Logged expenses</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center gap-1.5"
                onClick={() => handleCreateNew('EXPENSE')}
              >
                <Receipt className="w-3.5 h-3.5 text-primary" />
                Log Expense →
              </Button>
            </CardContent>
          </Card>

          {/* GYM WORKOUT WIDGET */}
          <Card className="flex flex-col justify-between">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-primary uppercase tracking-wider text-[10px]">
                  LAST WORKOUT
                </span>
                <Dumbbell className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <CardTitle className="text-base">{lastWorkout ? lastWorkout.title : 'Gym Session'}</CardTitle>
              <CardDescription className="text-xs font-mono">
                {lastWorkout?.workout?.exercises?.length || 0} exercises recorded
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center gap-1.5"
                onClick={() => handleCreateNew('WORKOUT')}
              >
                <Dumbbell className="w-3.5 h-3.5 text-primary" />
                Log Workout →
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* QUICK TEMPLATES */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Quick Capture Presets
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreateNew('NOTE')}
            className="gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-primary" />
            Normal Note
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreateNew('WEEKLY_REVIEW')}
            className="gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5 text-primary" />
            Weekly Review
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreateNew('EXPENSE')}
            className="gap-1.5"
          >
            <Receipt className="w-3.5 h-3.5 text-primary" />
            Expense Log
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCreateNew('WORKOUT')}
            className="gap-1.5"
          >
            <Dumbbell className="w-3.5 h-3.5 text-primary" />
            Gym Workout
          </Button>
        </div>
      </div>

      {/* RECENT ENTRIES LIST */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {defaultKind ? `${defaultKind} Entries` : 'Recent Journal Entries'}
        </h3>
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-6">Loading entries...</div>
        ) : recentNotes.length === 0 ? (
          <Card className="p-8 text-center space-y-2">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto" />
            <div className="text-sm font-semibold text-foreground">No entries found</div>
            <p className="text-xs text-muted-foreground">
              Create your first entry or select a template above.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentNotes.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
