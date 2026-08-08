import type { GroupMode, SortMode } from '../PlanningPage';

const PLANNING_VIEW_SETTINGS_KEY = 'itu.planning.view-settings-v2';
const LEGACY_PLANNING_VIEW_SETTINGS_KEY = 'itu.planning.view-settings';

export type PlanningViewKey = 'all' | 'today' | 'inbox' | 'upcoming';

export interface PlanningViewSettings {
  sortMode: SortMode;
  groupMode: GroupMode;
  displayMode: 'list' | 'kanban';
  hideCompleted: boolean;
  hideDetails: boolean;
  collapsedGroups: Record<string, boolean>;
}

export interface PlanningPreferencesV2 {
  version: 2;
  lastView: PlanningViewKey;
  views: Record<PlanningViewKey, PlanningViewSettings>;
}

export const defaultViewSettingsFor = (view: PlanningViewKey): PlanningViewSettings => {
  switch (view) {
    case 'all':
      return { sortMode: 'priority', groupMode: 'project', displayMode: 'list', hideCompleted: false, hideDetails: false, collapsedGroups: {} };
    case 'today':
      return { sortMode: 'manual', groupMode: 'time', displayMode: 'list', hideCompleted: false, hideDetails: false, collapsedGroups: {} };
    case 'inbox':
      return { sortMode: 'created-desc', groupMode: 'none', displayMode: 'list', hideCompleted: false, hideDetails: false, collapsedGroups: {} };
    case 'upcoming':
      return { sortMode: 'due', groupMode: 'time', displayMode: 'list', hideCompleted: false, hideDetails: false, collapsedGroups: {} };
  }
};

const groupModes: GroupMode[] = ['time', 'project', 'tag', 'status', 'priority', 'created', 'section', 'none'];
const sortModes: SortMode[] = [
  'manual',
  'due',
  'priority',
  'created-desc',
  'created-asc',
  'modified-desc',
  'modified-asc',
  'title',
  'created',
];
const displayModes: Array<PlanningViewSettings['displayMode']> = ['list', 'kanban'];

function sanitizeViewSettings(raw: unknown, viewKey: PlanningViewKey): PlanningViewSettings {
  const fallback = defaultViewSettingsFor(viewKey);
  if (!raw || typeof raw !== 'object') return fallback;
  const parsed = raw as Partial<PlanningViewSettings>;
  return {
    sortMode: sortModes.includes(parsed.sortMode as SortMode) ? (parsed.sortMode as SortMode) : fallback.sortMode,
    groupMode: groupModes.includes(parsed.groupMode as GroupMode) ? (parsed.groupMode as GroupMode) : fallback.groupMode,
    displayMode: displayModes.includes(parsed.displayMode as PlanningViewSettings['displayMode'])
      ? (parsed.displayMode as PlanningViewSettings['displayMode'])
      : fallback.displayMode,
    hideCompleted: typeof parsed.hideCompleted === 'boolean' ? parsed.hideCompleted : fallback.hideCompleted,
    hideDetails: typeof parsed.hideDetails === 'boolean' ? parsed.hideDetails : fallback.hideDetails,
    collapsedGroups: parsed.collapsedGroups && typeof parsed.collapsedGroups === 'object' ? parsed.collapsedGroups : {},
  };
}

export function readPlanningPreferencesV2(): PlanningPreferencesV2 {
  try {
    const rawV2 = window.localStorage.getItem(PLANNING_VIEW_SETTINGS_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<PlanningPreferencesV2>;
      if (parsed.version === 2 && parsed.views && typeof parsed.views === 'object') {
        return {
          version: 2,
          lastView: (['all', 'today', 'inbox', 'upcoming'].includes(parsed.lastView as string) ? parsed.lastView : 'today') as PlanningViewKey,
          views: {
            all: sanitizeViewSettings(parsed.views.all, 'all'),
            today: sanitizeViewSettings(parsed.views.today, 'today'),
            inbox: sanitizeViewSettings(parsed.views.inbox, 'inbox'),
            upcoming: sanitizeViewSettings(parsed.views.upcoming, 'upcoming'),
          },
        };
      }
    }

    // Migration from legacy shared object key
    const legacyRaw = window.localStorage.getItem(LEGACY_PLANNING_VIEW_SETTINGS_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      const migratedSingle = sanitizeViewSettings(legacyParsed, 'today');
      const migrated: PlanningPreferencesV2 = {
        version: 2,
        lastView: 'today',
        views: {
          all: { ...migratedSingle, ...defaultViewSettingsFor('all') },
          today: { ...migratedSingle },
          inbox: { ...migratedSingle, ...defaultViewSettingsFor('inbox') },
          upcoming: { ...migratedSingle, ...defaultViewSettingsFor('upcoming') },
        },
      };
      savePlanningPreferencesV2(migrated);
      return migrated;
    }
  } catch {
    // fallback
  }

  return {
    version: 2,
    lastView: 'today',
    views: {
      all: defaultViewSettingsFor('all'),
      today: defaultViewSettingsFor('today'),
      inbox: defaultViewSettingsFor('inbox'),
      upcoming: defaultViewSettingsFor('upcoming'),
    },
  };
}

export function savePlanningPreferencesV2(prefs: PlanningPreferencesV2) {
  window.localStorage.setItem(PLANNING_VIEW_SETTINGS_KEY, JSON.stringify(prefs));
}

export function readPlanningViewSettings(view: PlanningViewKey): PlanningViewSettings {
  const prefs = readPlanningPreferencesV2();
  return prefs.views[view] || defaultViewSettingsFor(view);
}

export function savePlanningViewSettings(view: PlanningViewKey, settings: PlanningViewSettings) {
  const prefs = readPlanningPreferencesV2();
  prefs.lastView = view;
  prefs.views[view] = settings;
  savePlanningPreferencesV2(prefs);
}
