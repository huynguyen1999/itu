import { FileText, Plus, Search, Sparkles, CloudOff, RefreshCw, TriangleAlert, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useJournalEntries, useJournalTemplates } from './journalQueries';
import { JournalEntryCard } from './components/JournalEntryCard';
import { createUlid } from '../../shared/sync/syncIdentity';
import { getLocalTodayDateString, formatDateStringToLocalDisplay } from './journalDate';
import { useSync } from '@/shared/sync/SyncProvider';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import type { JournalEntryKind } from './journal.types';

interface JournalDashboardProps {
  defaultKind?: JournalEntryKind;
}

export function JournalDashboard({ defaultKind }: JournalDashboardProps) {
  const navigate = useNavigate();
  const { state: syncState } = useSync();
  const {
    data: entries = [],
    isLoading,
    isError,
    refetch,
  } = useJournalEntries(defaultKind ? { kind: defaultKind } : undefined);
  const { data: templates = [] } = useJournalTemplates();

  const todayStr = getLocalTodayDateString();
  const todayNote = entries.find((e) => !e.deletedAt && e.entryDate.startsWith(todayStr) && e.kind === 'NOTE');

  const filteredEntries = entries.filter((entry) => !entry.deletedAt && (!defaultKind || entry.kind === defaultKind));
  const recentEntries = filteredEntries.slice(0, 6);

  const handleStartDailyNote = () => {
    if (todayNote) {
      navigate(`/journal/entry/${todayNote.id}`);
      return;
    }
    const newId = createUlid();
    const dailyTpl = templates.find((t) => t.name.toLowerCase().includes('daily'));
    const defaultBody = dailyTpl ? dailyTpl.bodyMarkdown : '';

    navigate(`/journal/entry/${newId}`, {
      state: {
        isNew: true,
        kind: 'NOTE',
        title: '',
        contentMarkdown: defaultBody,
        entryDate: todayStr,
      },
    });
  };

  const handleCreateNew = (kind: JournalEntryKind) => {
    const newId = createUlid();
    const titleMap = {
      NOTE: `Note — ${new Date().toLocaleDateString()}`,
      WEEKLY_REVIEW: `Weekly Review — Week ${getWeekNumber(new Date())}`,
    };
    navigate(`/journal/entry/${newId}`, {
      state: { isNew: true, kind, title: titleMap[kind], entryDate: todayStr },
    });
  };

  const syncPresentation = getSyncPresentation(syncState);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <PageHeader
        kicker="Daily writing"
        title="Make a little room."
        description="A quiet place for the day as it is. Write freely first; organize it when you are ready."
      >
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <SyncStatus phase={syncPresentation.phase} label={syncPresentation.label} />
          <Button variant="outline" size="sm" onClick={() => navigate('/journal/notes')} className="gap-1.5">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
          <Button size="sm" onClick={() => handleCreateNew(defaultKind || 'NOTE')} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New note
          </Button>
        </div>
      </PageHeader>

      <section aria-labelledby="journal-today" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="itu-gradient-card overflow-hidden rounded-[var(--itu-radius-l)] border-none p-6 shadow-[var(--itu-shadow-card)] sm:p-8">
          <div className="relative flex min-h-[210px] flex-col justify-between gap-8">
            <div className="space-y-3">
              <p className="text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-[var(--itu-teal-400)]">
                {formatDateStringToLocalDisplay(todayStr)}
              </p>
              <h2 id="journal-today" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {todayNote ? todayNote.title || 'Today’s note' : 'What is on your mind?'}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-white/70">
                {todayNote?.contentMarkdown
                  ? stripMarkdown(todayNote.contentMarkdown)
                  : 'Start with one honest sentence. There is no format to get right.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleStartDailyNote}
                className="gap-2 bg-white text-[var(--itu-teal-900)] hover:bg-white/90"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {todayNote ? 'Continue writing' : 'Start today’s note'}
              </Button>
              <span className="text-xs text-white/60">Your draft is saved locally as you write.</span>
            </div>
          </div>
        </div>

        <aside className="rounded-[var(--itu-radius-m)] border border-border bg-card p-5 shadow-[var(--itu-shadow-card)]">
          <p className="text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Keep the thread
          </p>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            Notes can stay rough. Tags, templates, attachments, and revisions are there when the thought is out.
          </p>
          <div className="mt-5 border-t border-border/60 pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/journal/weekly')}
              className="w-full justify-between px-2 text-left"
            >
              Weekly review
              <span aria-hidden="true">→</span>
            </Button>
          </div>
        </aside>
      </section>

      <section aria-labelledby="journal-recent" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {defaultKind ? `${formatKind(defaultKind)} entries` : 'Your pages'}
            </p>
            <h2 id="journal-recent" className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              Recent writing
            </h2>
          </div>
          <Button variant="link" size="sm" onClick={() => navigate('/journal/notes')}>
            Browse all notes
          </Button>
        </div>

        {isError && (
          <div
            role="alert"
            className="rounded-[var(--itu-radius-m)] border border-[var(--itu-coral-500)]/30 bg-[var(--itu-coral-100)]/60 p-5"
          >
            <p className="text-sm font-semibold text-foreground">Your journal could not be loaded.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your local drafts are still safe. Try loading the list again.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-4">
              Try again
            </Button>
          </div>
        )}

        {isLoading ? (
          <div aria-busy="true" className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="motion-safe:animate-pulse h-36 rounded-[var(--itu-radius-m)] border border-border bg-card"
              />
            ))}
          </div>
        ) : recentEntries.length === 0 ? (
          isError ? null : (
            <div className="rounded-[var(--itu-radius-m)] border border-dashed border-border bg-card p-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-primary/70" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-foreground">Nothing written here yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start today’s note, or open a blank note when a thought arrives.
              </p>
              <Button size="sm" onClick={() => handleCreateNew('NOTE')} className="mt-4">
                Write a note
              </Button>
            </div>
          )
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recentEntries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SyncStatus({ phase, label }: { phase: string; label: string }) {
  const Icon =
    phase === 'offline' ? CloudOff : phase === 'syncing' ? RefreshCw : phase === 'conflict' ? TriangleAlert : Check;
  const color =
    phase === 'offline' || phase === 'conflict' ? 'text-[var(--itu-coral-500)]' : 'text-[var(--itu-teal-600)]';
  return (
    <span
      className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--itu-radius-s)] border border-border bg-card px-3 text-[11px] text-muted-foreground"
      title={label}
    >
      <Icon
        className={`h-3.5 w-3.5 ${color} ${phase === 'syncing' ? 'motion-safe:animate-spin' : ''}`}
        aria-hidden="true"
      />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only">Journal sync status: {label}</span>
    </span>
  );
}

function getSyncPresentation(state: { phase: string; pendingCount: number; conflictCount: number }) {
  if (state.phase === 'offline') {
    return {
      phase: state.phase,
      label: state.pendingCount
        ? `${state.pendingCount} draft${state.pendingCount === 1 ? '' : 's'} waiting`
        : 'Offline',
    };
  }
  if (state.phase === 'syncing') return { phase: state.phase, label: 'Syncing' };
  if (state.phase === 'conflict') {
    return { phase: state.phase, label: `${state.conflictCount} sync conflict${state.conflictCount === 1 ? '' : 's'}` };
  }
  if (state.pendingCount)
    return { phase: state.phase, label: `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} waiting` };
  return { phase: state.phase, label: 'Up to date' };
}

function stripMarkdown(value: string) {
  return (
    value
      .replace(/[#*_>`\[\]]/g, '')
      .replace(/\n+/g, ' ')
      .trim() || 'An empty page, ready for the next line.'
  );
}

function formatKind(kind: JournalDashboardProps['defaultKind']) {
  return kind ? kind.replace('_', ' ').toLowerCase() : 'journal';
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
