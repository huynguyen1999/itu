export const ANYTIME_GROUP = 'Anytime';

export function localDay(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export function shiftDay(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return localDay(d);
}
