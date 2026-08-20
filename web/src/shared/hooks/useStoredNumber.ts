import { useEffect, useState } from 'react';
import { safeLocalStorage } from '@/shared/browser/safeStorage';

export function useStoredNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => {
    const stored = Number(safeLocalStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  });
  useEffect(() => safeLocalStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue] as const;
}
