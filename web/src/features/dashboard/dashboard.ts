import type { GrowthSkill, StudyCalendarDay } from '@/shared/api/types';
import { isSelectableGrowthEntry } from '@/shared/growthEntryFilters';

export const MAX_HOME_PROFILE_ITEMS = 8;

export function summarizeTodayActivity(days: StudyCalendarDay[]) {
  return days.reduce(
    (summary, day) => ({
      focusedMinutes: summary.focusedMinutes + day.focusedMinutes,
      reviewedCards: summary.reviewedCards + day.reviews,
      completedTasks: summary.completedTasks + day.completedTasks,
    }),
    { focusedMinutes: 0, reviewedCards: 0, completedTasks: 0 },
  );
}

export function growthProfileItems(skills: GrowthSkill[]) {
  return skills.filter(isSelectableGrowthEntry).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'ATTRIBUTE' ? -1 : 1;
    return left.sortOrder - right.sortOrder;
  });
}

export function growthAttributeItems(skills: GrowthSkill[]) {
  return growthProfileItems(skills).filter((skill) => skill.kind === 'ATTRIBUTE');
}

export function parseHomeProfileSelection(value: string | null) {
  if (value === null) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;

    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))].slice(0, MAX_HOME_PROFILE_ITEMS);
  } catch {
    return null;
  }
}

export function resolveHomeProfileSelection(storedIds: string[] | null, availableIds: string[]) {
  const defaultIds = availableIds.slice(0, MAX_HOME_PROFILE_ITEMS);
  if (storedIds === null) return defaultIds;

  const validIds = storedIds.filter((id) => availableIds.includes(id));
  if (storedIds.length > 0 && validIds.length === 0) return defaultIds;
  return validIds;
}

export function toggleHomeProfileItem(selectedIds: string[], itemId: string) {
  if (selectedIds.includes(itemId)) return selectedIds.filter((id) => id !== itemId);
  if (selectedIds.length >= MAX_HOME_PROFILE_ITEMS) return selectedIds;
  return [...selectedIds, itemId];
}

export function profileRadarValue(skill: GrowthSkill) {
  return Math.max(0, skill.currentXp);
}

export function profileRadarCeiling(skills: GrowthSkill[]) {
  const highestValue = Math.max(1, ...skills.map(profileRadarValue));
  return Math.ceil(highestValue * 1.1);
}

export function attributeRadarData(skills: GrowthSkill[]) {
  return skills
    .filter((skill) => skill.kind === 'ATTRIBUTE' && isSelectableGrowthEntry(skill))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      level: skill.level,
      icon: skill.icon,
      color: skill.color,
    }));
}

export function xpProgress(progressXp: number, requiredXp: number) {
  if (requiredXp <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((progressXp / requiredXp) * 100)));
}

export function formatFocusDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
