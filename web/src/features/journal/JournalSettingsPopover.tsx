import { Book } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_JOURNAL_PREFERENCES, type JournalPreferences } from '@/shared/api/preferencesApi';

export interface JournalDisplaySettings {
  lineWrap: boolean;
}

export const DEFAULT_JOURNAL_DISPLAY_SETTINGS: JournalDisplaySettings = {
  lineWrap: true,
};

export function JournalSettingsPopover({
  preferences = DEFAULT_JOURNAL_PREFERENCES,
  displaySettings = DEFAULT_JOURNAL_DISPLAY_SETTINGS,
  onChangePreferences,
  onChangeDisplay,
}: {
  preferences?: JournalPreferences;
  displaySettings?: JournalDisplaySettings;
  onChangePreferences: (patch: Partial<JournalPreferences>) => void;
  onChangeDisplay: (patch: Partial<JournalDisplaySettings>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Journal Settings"
      icon={<Book className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChangePreferences(DEFAULT_JOURNAL_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Editor">
          <FeatureSettingsRow label="Default mode">
            <select
              value={preferences.defaultEditorMode}
              onChange={(e) => onChangePreferences({ defaultEditorMode: e.target.value as JournalPreferences['defaultEditorMode'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="EDIT">Edit</option>
              <option value="LIVE">Live</option>
              <option value="PREVIEW">Preview</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Daily Notes">
          <FeatureSettingsRow label="Auto-create daily note">
            <input
              type="checkbox"
              checked={preferences.autoCreateDailyNote}
              onChange={(e) => onChangePreferences({ autoCreateDailyNote: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Auto-open today's note">
            <input
              type="checkbox"
              checked={preferences.autoOpenTodayNote}
              onChange={(e) => onChangePreferences({ autoOpenTodayNote: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Weekly Review">
          <FeatureSettingsRow label="Week starts on">
            <select
              value={preferences.weekStartDay}
              onChange={(e) => onChangePreferences({ weekStartDay: e.target.value as JournalPreferences['weekStartDay'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="MONDAY">Monday</option>
              <option value="SUNDAY">Sunday</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Auto-create weekly review">
            <input
              type="checkbox"
              checked={preferences.autoCreateWeeklyReview}
              onChange={(e) => onChangePreferences({ autoCreateWeeklyReview: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Markdown (Device-local)">
          <FeatureSettingsRow label="Line wrap">
            <input
              type="checkbox"
              checked={displaySettings.lineWrap}
              onChange={(e) => onChangeDisplay({ lineWrap: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
