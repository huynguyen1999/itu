import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api } from '@/shared/api/client';
import { focusDisplaySeconds, formatFocusTime } from '../utils/focusTimer';

export function GlobalFocusTimer() {
  const location = useLocation();
  const active = useQuery({ queryKey: ['focus', 'active'], queryFn: () => api.activeFocus() });
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!active.data) return null;
  const isFocusView = location.pathname === '/focus';
  if (isFocusView) return null;

  const seconds = focusDisplaySeconds(active.data, true);
  return (
    <Link
      to="/focus"
      className="fixed bottom-20 right-4 z-40 flex items-center gap-3 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-xl md:bottom-6"
    >
      <span className="max-w-40 truncate">{active.data.customTitle || active.data.taskTitleSnapshot || 'Focus'}</span>
      <span className="font-mono tabular-nums">{formatFocusTime(seconds)}</span>
    </Link>
  );
}
