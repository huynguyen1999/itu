export type GymWeightUnit = 'KG' | 'LBS';

const KG_TO_LBS = 2.2046226218;

export function toDisplayWeight(weightKg: number | null | undefined, unit: GymWeightUnit): number | null {
  if (weightKg === null || weightKg === undefined || !Number.isFinite(weightKg)) return null;
  return unit === 'LBS' ? weightKg * KG_TO_LBS : weightKg;
}

export function fromDisplayWeight(weight: number | null | undefined, unit: GymWeightUnit): number | null {
  if (weight === null || weight === undefined || !Number.isFinite(weight)) return null;
  return unit === 'LBS' ? weight / KG_TO_LBS : weight;
}

export function weightUnitLabel(unit: GymWeightUnit): 'kg' | 'lb' {
  return unit === 'LBS' ? 'lb' : 'kg';
}

export function formatWeight(
  weightKg: number | null | undefined,
  unit: GymWeightUnit,
  maximumFractionDigits = 2,
): string {
  const value = toDisplayWeight(weightKg, unit);
  if (value === null) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits })} ${weightUnitLabel(unit)}`;
}

export function formatVolume(volumeKg: number | null | undefined, unit: GymWeightUnit): string {
  return `${formatWeight(volumeKg, unit, 0)} volume`;
}
