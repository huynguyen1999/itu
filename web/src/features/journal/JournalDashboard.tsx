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
  Zap,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useJournalEntries, useJournalTemplates } from './journalQueries';
import { useCreateJournalEntryMutation } from './journalMutations';
import { JournalEntryCard } from './components/JournalEntryCard';
import { createUlid } from '../../shared/sync/syncIdentity';

export function JournalDashboard() {
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = useJournalEntries();
  const { data: templates = [] } = useJournalTemplates();
  const createMutation = useCreateJournalEntryMutation();

  const todayStr = new Date().toISOString().split('T')[0];
  const todayNote = entries.find((e) => e.entryDate.startsWith(todayStr) && e.kind === 'NOTE');

  const recentNotes = entries.slice(0, 5);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-purple-950/40 border border-slate-800/80 shadow-2xl">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            Personal Journal & Log
          </h1>
          <p className="text-xs text-slate-400">
            Universal reflection layer, Daily notes, Expenses, Gym workouts, and Weekly reviews.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/journal/search"
            className="p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <Search className="w-4 h-4 text-slate-400" />
            Search
          </Link>

          <div className="relative group">
            <button
              type="button"
              onClick={() => handleCreateNew('NOTE')}
              className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Log
            </button>
          </div>
        </div>
      </div>

      {/* Grid Dashboard Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TODAY DAILY NOTE CARD */}
        <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px]">
                TODAY'S REFLECTION
              </span>
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <h2 className="text-base font-bold text-slate-100">
              {todayNote ? todayNote.title : 'Daily Note'}
            </h2>
            <p className="text-xs text-slate-400 line-clamp-2">
              {todayNote
                ? todayNote.contentMarkdown || 'Empty daily reflection...'
                : "Capture today's highlights, learning, and progress."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleStartDailyNote()}
            className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-semibold text-xs border border-emerald-500/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {todayNote ? 'Open Daily Note →' : "Start Today's Reflection →"}
          </button>
        </div>

        {/* EXPENSES WIDGET */}
        <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-rose-400 uppercase tracking-wider text-[10px]">
                EXPENSES
              </span>
              <Receipt className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="text-xl font-bold font-mono text-slate-100">
              {expensesThisWeek.toLocaleString()} VND
            </div>
            <p className="text-xs text-slate-400">Total logged across recent entries</p>
          </div>

          <button
            type="button"
            onClick={() => handleCreateNew('EXPENSE')}
            className="w-full py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold text-xs border border-rose-500/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <Receipt className="w-3.5 h-3.5" />
            Log Expense →
          </button>
        </div>

        {/* GYM WORKOUT WIDGET */}
        <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-400 uppercase tracking-wider text-[10px]">
                LAST WORKOUT
              </span>
              <Dumbbell className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <h2 className="text-base font-bold text-slate-100">
              {lastWorkout ? lastWorkout.title : 'Push / Pull Day'}
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              {lastWorkout?.workout?.exercises?.length || 0} exercises recorded
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleCreateNew('WORKOUT')}
            className="w-full py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-semibold text-xs border border-sky-500/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <Dumbbell className="w-3.5 h-3.5" />
            Log Workout →
          </button>
        </div>
      </div>

      {/* QUICK TEMPLATES */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Quick Capture Templates
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleCreateNew('NOTE')}
            className="px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            Normal Note
          </button>
          <button
            type="button"
            onClick={() => handleCreateNew('WEEKLY_REVIEW')}
            className="px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            Weekly Review
          </button>
          <button
            type="button"
            onClick={() => handleCreateNew('EXPENSE')}
            className="px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <Receipt className="w-3.5 h-3.5 text-rose-400" />
            Expense Preset
          </button>
          <button
            type="button"
            onClick={() => handleCreateNew('WORKOUT')}
            className="px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <Dumbbell className="w-3.5 h-3.5 text-sky-400" />
            Gym Workout
          </button>
        </div>
      </div>

      {/* RECENT ENTRIES LIST */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Recent Journal Entries
        </h3>
        {isLoading ? (
          <div className="text-xs text-slate-500 py-6">Loading entries...</div>
        ) : recentNotes.length === 0 ? (
          <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
            <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-300">Your journal is empty</div>
            <p className="text-xs text-slate-500">
              Create your first Daily Note, log an expense, or write a weekly reflection.
            </p>
          </div>
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
