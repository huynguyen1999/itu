import { BookOpen } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_LEARN_PREFERENCES, type LearnPreferences } from '@/shared/api/preferencesApi';

export interface LearnDisplaySettings {
  showArchivedDecks: boolean;
  showCardCount: boolean;
}

export const DEFAULT_LEARN_DISPLAY_SETTINGS: LearnDisplaySettings = {
  showArchivedDecks: false,
  showCardCount: true,
};

export function LearnSettingsPopover({
  preferences = DEFAULT_LEARN_PREFERENCES,
  displaySettings = DEFAULT_LEARN_DISPLAY_SETTINGS,
  onChangePreferences,
  onChangeDisplay,
}: {
  preferences?: LearnPreferences;
  displaySettings?: LearnDisplaySettings;
  onChangePreferences: (patch: Partial<LearnPreferences>) => void;
  onChangeDisplay: (patch: Partial<LearnDisplaySettings>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Learn Settings"
      icon={<BookOpen className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChangePreferences(DEFAULT_LEARN_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Review (Synced)">
          <FeatureSettingsRow label="Review order">
            <select
              value={preferences.reviewOrder}
              onChange={(e) => onChangePreferences({ reviewOrder: e.target.value as LearnPreferences['reviewOrder'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="DUE_DATE">Due date</option>
              <option value="RANDOM">Random</option>
              <option value="PRIORITY">Priority</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Daily review limit">
            <input
              type="number"
              min="5"
              max="500"
              value={preferences.dailyReviewLimit}
              onChange={(e) => onChangePreferences({ dailyReviewLimit: Number(e.target.value) || 50 })}
              className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Daily new-card limit">
            <input
              type="number"
              min="0"
              max="200"
              value={preferences.dailyNewCardLimit}
              onChange={(e) => onChangePreferences({ dailyNewCardLimit: Number(e.target.value) || 20 })}
              className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Deck List">
          <FeatureSettingsRow label="Show archived">
            <input
              type="checkbox"
              checked={displaySettings.showArchivedDecks}
              onChange={(e) => onChangeDisplay({ showArchivedDecks: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Card count visibility">
            <input
              type="checkbox"
              checked={displaySettings.showCardCount}
              onChange={(e) => onChangeDisplay({ showCardCount: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
