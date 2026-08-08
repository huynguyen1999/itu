import type React from 'react';
import { useEffect, useState } from 'react';
import {
  Bell,
  CalendarClock,
  Cloud,
  Dumbbell,
  Flag,
  Grid2X2,
  ListTodo,
  Monitor,
  Palette,
  RotateCcw,
  Settings,
  Timer,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type GymPreferences, type MoneyPreferences } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { GrowthRewardEditor } from '@/shared/ui/GrowthRewardEditor';
import { GrowthResetDialog, SettingsView } from '@/features/growth';
import { MoneySettingsPanel } from './money/MoneySettingsPanel';
import { GymSettingsPanel } from './gym/GymSettingsPanel';
import { SettingsCard } from './components/SettingsCard';
import { useTheme } from '@/shared/ui/ThemeProvider';
import { readMatrixSettings, saveMatrixSettings, type MatrixSettings } from '@/shared/utils/matrixSettings';
import {
  DEFAULT_FOCUS_SETTINGS,
  getStoredFocusSettings,
  saveStoredFocusSettings,
  type FocusUserSettings,
} from '@/shared/utils/focusSettings';
import {
  DEFAULT_TASK_DEFAULTS,
  getStoredTaskDefaults,
  saveStoredTaskDefaults,
  type TaskDefaults,
} from '@/shared/taskDefaults';

type SettingsSection = 'appearance' | 'tasks' | 'focus' | 'money' | 'gym' | 'matrix' | 'growth' | 'notifications' | 'profile' | 'security' | 'sync' | 'device';

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'focus', label: 'Focus', icon: Timer },
  { id: 'money', label: 'Money', icon: Wallet },
  { id: 'gym', label: 'Gym', icon: Dumbbell },
  { id: 'matrix', label: 'Matrix', icon: Grid2X2 },
  { id: 'growth', label: 'Growth', icon: TrendingUp },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Account / Profile', icon: Monitor },
  { id: 'security', label: 'Security', icon: CalendarClock },
  { id: 'sync', label: 'Sync & Data', icon: Cloud },
  { id: 'device', label: 'Device & Permissions', icon: Flag },
];

export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>('appearance');
  const [matrixSettings, setMatrixSettings] = useState(readMatrixSettings);
  const [focusSettings, setFocusSettings] = useState(getStoredFocusSettings);
  const [taskDefaults, setTaskDefaults] = useState<TaskDefaults>(getStoredTaskDefaults);
  const [showReset, setShowReset] = useState(false);
  const theme = useTheme();
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ['growth', 'overview'],
    queryFn: () => api.growthOverview(),
    enabled: section === 'growth',
  });
  const focusPresets = useQuery({
    queryKey: ['focus-presets'],
    queryFn: () => api.focusPresets(),
    enabled: section === 'focus',
  });
  const taskLists = useQuery({
    queryKey: ['task-lists'],
    queryFn: () => api.taskLists(),
    enabled: section === 'tasks' || section === 'growth',
  });
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
    enabled: section === 'money' || section === 'gym',
  });

  const updateMoneyPref = useMutation({
    mutationFn: (patch: Partial<MoneyPreferences>) => api.updateMoneyPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });

  const updateGymPref = useMutation({
    mutationFn: (patch: Partial<GymPreferences>) => api.updateGymPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });

  const data = overview.data;

  const updateAccountBaseXp = useMutation({
    mutationFn: (newBaseXp: number) => api.updateGrowthProfile({ accountBaseXp: newBaseXp }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['growth'] }),
  });

  useEffect(() => saveMatrixSettings(matrixSettings), [matrixSettings]);
  useEffect(() => saveStoredFocusSettings(focusSettings), [focusSettings]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        kicker="Preferences & System"
        title="Settings"
        description="Configure appearance, tasks, focus timers, money, gym, matrix rules, and growth progression."
      />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border bg-card p-2 lg:sticky lg:top-8 lg:self-start">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                section === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              onClick={() => setSection(id)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </aside>

        <main className="min-w-0 space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Settings</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Control center</h1>
          </div>

          {section === 'appearance' && <AppearanceSettings theme={theme.theme} onToggleTheme={theme.toggleTheme} />}
          {section === 'tasks' && (
            <TaskDefaultsSettings
              defaults={taskDefaults}
              taskLists={taskLists.data ?? []}
              onChange={(next) => {
                setTaskDefaults(next);
                saveStoredTaskDefaults(next);
              }}
            />
          )}
          {section === 'focus' && (
            <FocusSettingsPanel
              settings={focusSettings}
              defaultFocusPresetId={focusPresets.data?.[0]?.id}
              defaultFocusPresetName={focusPresets.data?.[0]?.name}
              onChange={(patch) => setFocusSettings((current) => ({ ...current, ...patch }))}
            />
          )}
          {section === 'money' && (
            <MoneySettingsPanel
              preferences={userPreferences.data?.money}
              isLoading={userPreferences.isLoading}
              onChange={(patch) => updateMoneyPref.mutate(patch)}
            />
          )}
          {section === 'gym' && (
            <GymSettingsPanel
              preferences={userPreferences.data?.gym}
              isLoading={userPreferences.isLoading}
              onChange={(patch) => updateGymPref.mutate(patch)}
            />
          )}
          {section === 'matrix' && (
            <MatrixSettingsPanel
              settings={matrixSettings}
              onChange={(patch) => setMatrixSettings((current) => ({ ...current, ...patch }))}
            />
          )}
          {section === 'growth' &&
            (overview.isLoading || !data ? (
              <SettingsCard icon={TrendingUp} title="Growth" description="Loading Growth settings..." />
            ) : (
              <SettingsView
                data={data}
                onUpdateAccountBaseXp={(value) => updateAccountBaseXp.mutate(value)}
                onOpenReset={() => setShowReset(true)}
              />
            ))}
          {section === 'notifications' && (
            <SettingsCard
              icon={Bell}
              title="Notifications"
              description="Desktop and browser alert preferences are managed via system permissions."
            />
          )}
          {section === 'profile' && (
            <SettingsCard
              icon={Monitor}
              title="Account / Profile"
              description="Authenticated user identity, profile details, and active sessions."
            />
          )}
          {section === 'security' && (
            <SettingsCard
              icon={CalendarClock}
              title="Security"
              description="Password, active refresh sessions, and authentication security."
            />
          )}
          {section === 'sync' && (
            <SettingsCard
              icon={Cloud}
              title="Sync & Data"
              description="Offline outbox, IndexedDB persistence lease, and sync status."
            />
          )}
          {section === 'device' && (
            <SettingsCard
              icon={Flag}
              title="Device & Permissions"
              description="Browser installation ID, client instance tab session, and Web platform permissions."
            />
          )}
        </main>

        {data && <GrowthResetDialog open={showReset} skills={data.skills} onClose={() => setShowReset(false)} />}
      </div>
    </div>
  );
}

function TaskDefaultsSettings({
  defaults,
  taskLists,
  onChange,
}: {
  defaults: TaskDefaults;
  taskLists: Awaited<ReturnType<typeof api.taskLists>>;
  onChange: (defaults: TaskDefaults) => void;
}) {
  const update = <K extends keyof TaskDefaults>(key: K, value: TaskDefaults[K]) =>
    onChange({ ...defaults, [key]: value });

  return (
    <SettingsCard
      icon={ListTodo}
      title="Task defaults"
      description="Pre-fill new tasks while keeping every task editable."
    >
      <TaskDefaultRow icon={CalendarClock} label="Default date">
        <select value={defaults.date} onChange={(event) => update('date', event.target.value as TaskDefaults['date'])}>
          <option value="NONE">No date</option>
          <option value="TODAY">Today at 6:00 PM</option>
          <option value="TOMORROW">Tomorrow at 6:00 PM</option>
        </select>
      </TaskDefaultRow>
      <TaskDefaultRow icon={Flag} label="Default priority">
        <select
          value={defaults.priority}
          onChange={(event) => update('priority', event.target.value as TaskDefaults['priority'])}
        >
          <option value="NONE">No priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </TaskDefaultRow>
      <TaskDefaultRow icon={ListTodo} label="Default list">
        <select value={defaults.taskListId} onChange={(event) => update('taskListId', event.target.value)}>
          <option value="">Inbox</option>
          {taskLists
            .filter((list) => !list.archivedAt)
            .map((list) => (
              <option key={list.id} value={list.id}>
                {list.title}
              </option>
            ))}
        </select>
      </TaskDefaultRow>
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Saved on this device and applied to every new task.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(DEFAULT_TASK_DEFAULTS)}>
          Reset defaults
        </Button>
      </div>
    </SettingsCard>
  );
}

function TaskDefaultRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof ListTodo;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-14 items-center gap-3 border-t py-3 first:border-t-0">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className="[&_select]:h-9 [&_select]:min-w-40 [&_select]:rounded-md [&_select]:border [&_select]:bg-background [&_select]:px-2 [&_select]:text-right [&_select]:text-sm">
        {children}
      </span>
    </label>
  );
}

function AppearanceSettings({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  return (
    <div className="grid gap-4">
      <SettingsCard icon={Monitor} title="Theme" description="Switch the app between light and dark mode.">
        <Button onClick={onToggleTheme} className="w-fit">
          Use {theme === 'dark' ? 'light' : 'dark'} mode
        </Button>
      </SettingsCard>
      <SettingsCard
        icon={Bell}
        title="Notifications"
        description="Notification delivery and browser permission controls remain in the notification menu."
      />
      <SettingsCard
        icon={Cloud}
        title="Sync"
        description="Cloud sync status and conflict controls remain available from the rail cloud icon."
      />
    </div>
  );
}

function FocusSettingsPanel({
  settings,
  defaultFocusPresetId,
  defaultFocusPresetName,
  onChange,
}: {
  settings: FocusUserSettings;
  defaultFocusPresetId?: string;
  defaultFocusPresetName?: string;
  onChange: (patch: Partial<FocusUserSettings>) => void;
}) {
  return (
    <div className="grid gap-4">
      <SettingsCard
        icon={Timer}
        title="Timer Defaults"
        description="Set the timer length Focus uses before you choose a custom duration."
      >
        <label className="grid gap-1 text-sm font-semibold sm:max-w-xs">
          Default focus length
          <input
            type="number"
            min="1"
            max="180"
            value={settings.defaultWorkMinutes}
            onChange={(event) =>
              onChange({
                defaultWorkMinutes: Math.max(
                  1,
                  Math.min(180, Number(event.target.value) || DEFAULT_FOCUS_SETTINGS.defaultWorkMinutes),
                ),
              })
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          />
        </label>
      </SettingsCard>

      <SettingsCard
        icon={TrendingUp}
        title="Default Focus Growth"
        description="Choose the XP, coins, and items awarded when a default focus session is completed."
      >
        {defaultFocusPresetId ? (
          <div className="rounded-xl border bg-background p-3">
            <p className="mb-3 text-sm font-bold">{defaultFocusPresetName ?? 'Default focus preset'}</p>
            <GrowthRewardEditor sourceType="FOCUS_PRESET" sourceId={defaultFocusPresetId} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No focus preset is available yet.</p>
        )}
      </SettingsCard>
    </div>
  );
}

function MatrixSettingsPanel({
  settings,
  onChange,
}: {
  settings: MatrixSettings;
  onChange: (patch: Partial<MatrixSettings>) => void;
}) {
  const togglePriority = (
    field: 'urgentPriorities' | 'importantPriorities',
    priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
  ) => {
    const values = settings[field].includes(priority)
      ? settings[field].filter((value) => value !== priority)
      : [...settings[field], priority];
    onChange({ [field]: values.length ? values : ['HIGH'] });
  };

  return (
    <div className="grid gap-4">
      <SettingsCard
        icon={Grid2X2}
        title="Eisenhower Matrix Conditions"
        description="Choose how tasks are placed in the Eisenhower Matrix."
      >
        <label className="grid gap-1 text-sm font-semibold sm:max-w-xs">
          Urgent when due within
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="365"
              value={settings.urgentDueWithinDays}
              onChange={(event) => onChange({ urgentDueWithinDays: Math.max(0, Number(event.target.value) || 0) })}
              className="h-10 w-24 rounded-md border bg-background px-3 text-sm"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </label>
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Urgent priority triggers</p>
          <div className="flex flex-wrap gap-2">
            {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((priority) => (
              <button
                key={`urgent-${priority}`}
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                  settings.urgentPriorities.includes(priority)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground'
                }`}
                onClick={() => togglePriority('urgentPriorities', priority)}
              >
                {priority === 'NONE' ? 'None' : priority.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Important priority triggers</p>
          <div className="flex flex-wrap gap-2">
            {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((priority) => (
              <button
                key={`important-${priority}`}
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                  settings.importantPriorities.includes(priority)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground'
                }`}
                onClick={() => togglePriority('importantPriorities', priority)}
              >
                {priority === 'NONE' ? 'None' : priority.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>
      <SettingsCard icon={RotateCcw} title="Defaults" description="Restore the standard Matrix placement conditions.">
        <Button
          variant="outline"
          className="w-fit"
          onClick={() =>
            onChange({
              urgentDueWithinDays: 2,
              urgentPriorities: ['HIGH'],
              importantPriorities: ['HIGH'],
            })
          }
        >
          Restore defaults
        </Button>
      </SettingsCard>
    </div>
  );
}
