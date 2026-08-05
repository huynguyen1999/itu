import type { GrowthSkill } from './api/types';

/** Active UI choices never include the archived legacy General attribute. */
export function isSelectableGrowthEntry(entry: Pick<GrowthSkill, 'kind' | 'starterKey' | 'archivedAt' | 'name'>) {
  if (entry.archivedAt) return false;
  if (
    entry.kind === 'ATTRIBUTE' &&
    (entry.starterKey === 'attribute-general' || entry.name.trim().toLocaleLowerCase() === 'general')
  ) {
    return false;
  }
  return true;
}
