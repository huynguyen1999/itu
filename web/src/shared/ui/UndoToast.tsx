import { RotateCcw, X } from 'lucide-react';
import type { UndoAction } from '@/shared/hooks/useUndoStack';

interface UndoToastProps {
  action: UndoAction | null;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ action, onUndo, onDismiss }: UndoToastProps) {
  if (!action) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-200"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-2xl text-sm text-popover-foreground min-w-[240px]">
        <span className="flex-1 font-medium">{action.label}</span>
        <button
          type="button"
          onClick={onUndo}
          className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
