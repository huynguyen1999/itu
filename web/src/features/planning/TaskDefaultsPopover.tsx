import { ArrowLeft, ListTodo } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_TASK_PREFERENCES, type TaskPreferences } from '@/shared/api/preferencesApi';
import { Button } from '@/shared/ui/button';

export function TaskDefaultsPopover({
  preferences = DEFAULT_TASK_PREFERENCES,
  taskLists = [],
  onBack,
  onChange,
}: {
  preferences?: TaskPreferences;
  taskLists?: Array<{ id: string; title: string }>;
  onBack: () => void;
  onChange?: (patch: Partial<TaskPreferences>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Task Defaults"
      icon={<ListTodo className="h-4 w-4 text-primary" />}
      footer={
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
          <FeatureSettingsReset onReset={() => onChange?.(DEFAULT_TASK_PREFERENCES)} />
        </div>
      }
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Defaults for new tasks">
          <FeatureSettingsRow label="Default date">
            <select
              value={preferences.defaultDate}
              onChange={(e) => onChange?.({ defaultDate: e.target.value as TaskPreferences['defaultDate'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="NONE">No date</option>
              <option value="TODAY">Today</option>
              <option value="TOMORROW">Tomorrow</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Default due time">
            <input
              aria-label="Default due time"
              type="time"
              value={preferences.defaultDueTime}
              onChange={(e) => onChange?.({ defaultDueTime: e.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Default priority">
            <select
              value={preferences.defaultPriority}
              onChange={(e) => onChange?.({ defaultPriority: e.target.value as TaskPreferences['defaultPriority'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="NONE">None</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Default list">
            <select
              value={preferences.defaultTaskListId}
              onChange={(e) => onChange?.({ defaultTaskListId: e.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">Inbox</option>
              {taskLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.title}
                </option>
              ))}
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
