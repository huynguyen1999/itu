import type { GroupMode, SortMode } from '../PlanningPage';

const PLANNING_VIEW_SETTINGS_KEY = 'itu.planning.view-settings';

export interface PlanningViewSettings {
  sortMode: SortMode;
  groupMode: GroupMode;
  displayMode: 'list' | 'kanban';
  hideCompleted: boolean;
  hideDetails: boolean;
  collapsedGroups: Record<string, boolean>;
}

export const defaultPlanningViewSettings: PlanningViewSettings = {
  sortMode: 'created-desc',
  groupMode: 'project',
  displayMode: 'list',
  hideCompleted: false,
  hideDetails: false,
  collapsedGroups: {},
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

export function readPlanningViewSettings(): PlanningViewSettings {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PLANNING_VIEW_SETTINGS_KEY) || '{}',
    ) as Partial<PlanningViewSettings>;
    return {
      sortMode: sortModes.includes(parsed.sortMode as SortMode)
        ? (parsed.sortMode as SortMode)
        : defaultPlanningViewSettings.sortMode,
      groupMode: groupModes.includes(parsed.groupMode as GroupMode)
        ? (parsed.groupMode as GroupMode)
        : defaultPlanningViewSettings.groupMode,
      displayMode: displayModes.includes(parsed.displayMode as PlanningViewSettings['displayMode'])
        ? (parsed.displayMode as PlanningViewSettings['displayMode'])
        : defaultPlanningViewSettings.displayMode,
      hideCompleted:
        typeof parsed.hideCompleted === 'boolean' ? parsed.hideCompleted : defaultPlanningViewSettings.hideCompleted,
      hideDetails:
        typeof parsed.hideDetails === 'boolean' ? parsed.hideDetails : defaultPlanningViewSettings.hideDetails,
      collapsedGroups:
        parsed.collapsedGroups && typeof parsed.collapsedGroups === 'object' ? parsed.collapsedGroups : {},
    };
  } catch {
    return defaultPlanningViewSettings;
  }
}

export function savePlanningViewSettings(settings: PlanningViewSettings) {
  window.localStorage.setItem(PLANNING_VIEW_SETTINGS_KEY, JSON.stringify(settings));
}
