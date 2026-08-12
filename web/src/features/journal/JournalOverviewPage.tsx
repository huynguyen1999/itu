import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Search } from 'lucide-react';
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
import { getLocalTodayDateString } from './journalDate';

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

  const todayStr = getLocalTodayDateString();
  const activeEntries = entries.filter((entry) => !entry.deletedAt);
  const dailyNote = activeEntries.find((e) => e.kind === 'NOTE' && e.entryDate === todayStr);
  const notes = activeEntries.filter((entry) => entry.kind === 'NOTE' || entry.kind === 'WEEKLY_REVIEW');

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <PageHeader
        kicker="Writing space"
        title="Journal"
        description="A quiet place to write, review, and keep your notes"
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

      <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Today</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              {dailyNote ? dailyNote.title : 'Start today\'s note'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{todayStr}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(dailyNote ? `/journal/notes/${dailyNote.id}` : `/journal/daily/${todayStr}`)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {dailyNote ? 'Continue writing' : 'Write today'}
          </button>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          Start with whatever is on your mind. Add structure later with templates, tags, attachments, or a weekly review.
        </p>
      </section>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent writing
          </h3>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/journal/notes')} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Search className="h-3.5 w-3.5" /> Search
            </button>
            <button type="button" onClick={() => navigate('/journal/weekly')} className="text-xs font-medium text-primary hover:underline">
              Weekly review
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-sm">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading notes…</div> : notes.slice(0, 8).map((entry) => (
            <div
              key={entry.id}
              onClick={() => navigate(entry.kind === 'WEEKLY_REVIEW' ? `/journal/weekly/${entry.id}` : `/journal/notes/${entry.id}`)}
              className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{entry.contentMarkdown || 'No content'}</p>
                </div>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                {entry.kind}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
