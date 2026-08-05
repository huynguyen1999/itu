import type { GrowthAttributeMappingDraft, GrowthAttributeMappingSlot } from '@/shared/api/types';

export type GrowthMappingValidation = {
  valid: boolean;
  errors: string[];
};

/**
 * Validate the user-editable Skill → Attribute routing contract before it is
 * sent to the API. A route always has one primary attribute and may have one
 * secondary attribute; weights are integer percentages that total 100.
 */
export function validateGrowthAttributeMappings(mappings: GrowthAttributeMappingDraft[]): GrowthMappingValidation {
  const errors: string[] = [];
  const primary = mappings.filter((mapping) => mapping.slot === 'PRIMARY');
  const secondary = mappings.filter((mapping) => mapping.slot === 'SECONDARY');

  if (mappings.length < 1 || mappings.length > 2) {
    errors.push('Choose one primary attribute and at most one secondary attribute.');
  }
  if (primary.length !== 1) errors.push('Exactly one primary attribute is required.');
  if (secondary.length > 1) errors.push('Only one secondary attribute is allowed.');

  const normalized = mappings.map((mapping) => ({ ...mapping, weight: Number(mapping.weight) }));
  const primaryWeight = normalized.find((mapping) => mapping.slot === 'PRIMARY')?.weight;
  if (primaryWeight !== undefined && (!Number.isInteger(primaryWeight) || primaryWeight < 70 || primaryWeight > 100)) {
    errors.push('Primary weight must be an integer from 70% to 100%.');
  }
  const secondaryWeight = normalized.find((mapping) => mapping.slot === 'SECONDARY')?.weight;
  if (
    secondaryWeight !== undefined &&
    (!Number.isInteger(secondaryWeight) || secondaryWeight < 1 || secondaryWeight > 30)
  ) {
    errors.push('Secondary weight must be an integer from 1% to 30%.');
  }
  if (new Set(mappings.map((mapping) => mapping.attributeId).filter(Boolean)).size !== mappings.length) {
    errors.push('Primary and secondary attributes must be different.');
  }
  if (normalized.reduce((sum, mapping) => sum + (Number.isFinite(mapping.weight) ? mapping.weight : 0), 0) !== 100) {
    errors.push('Mapping weights must total 100%.');
  }

  return { valid: errors.length === 0, errors };
}

export function growthMappingSlotLabel(slot: GrowthAttributeMappingSlot) {
  return slot === 'PRIMARY' ? 'Primary' : 'Secondary';
}
