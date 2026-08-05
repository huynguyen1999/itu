import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface UndoAction {
  label: string;
  undo: () => void | Promise<void>;
}

interface UndoStackContext {
  push: (action: UndoAction) => void;
  pop: () => UndoAction | undefined;
  peek: () => UndoAction | undefined;
  clear: () => void;
}

const UndoContext = createContext<UndoStackContext | null>(null);

export function UndoStackProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<UndoAction[]>([]);

  const push = useCallback((action: UndoAction) => {
    stackRef.current = [...stackRef.current.slice(-4), action]; // keep up to 5
  }, []);

  const pop = useCallback(() => {
    const last = stackRef.current[stackRef.current.length - 1];
    stackRef.current = stackRef.current.slice(0, -1);
    return last;
  }, []);

  const peek = useCallback(() => {
    return stackRef.current[stackRef.current.length - 1];
  }, []);

  const clear = useCallback(() => {
    stackRef.current = [];
  }, []);

  return <UndoContext.Provider value={{ push, pop, peek, clear }}>{children}</UndoContext.Provider>;
}

export function useUndoStack() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndoStack must be used within UndoStackProvider');
  return ctx;
}

/** Hook that registers a global Ctrl+Z / Cmd+Z listener and calls the top undo action */
export function useGlobalUndo() {
  const { pop } = useUndoStack();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const trigger = isMac ? e.metaKey && e.key === 'z' : e.ctrlKey && e.key === 'z';
      if (!trigger || e.shiftKey) return;
      const action = pop();
      if (action) {
        e.preventDefault();
        void action.undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pop]);
}

/** Hook that auto-dismisses the latest undo toast after a delay */
export function useUndoToast(durationMs = 2000) {
  const { peek, pop } = useUndoStack();
  const [current, setCurrent] = useState<UndoAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (action: UndoAction) => {
      setCurrent(action);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCurrent(null);
      }, durationMs);
    },
    [durationMs],
  );

  const handleUndo = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const action = pop();
    if (action) await action.undo();
    setCurrent(null);
  }, [pop]);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrent(null);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { current, show, handleUndo, dismiss };
}
