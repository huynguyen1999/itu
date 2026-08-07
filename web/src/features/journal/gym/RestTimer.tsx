import { useEffect, useState } from 'react';
import { Timer, X, Play, Pause, RotateCcw } from 'lucide-react';

interface RestTimerProps {
  initialSeconds?: number;
  onFinish?: () => void;
  onClose?: () => void;
}

export function RestTimer({ initialSeconds = 120, onFinish, onClose }: RestTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    setSeconds(initialSeconds);
    setIsRunning(true);
  }, [initialSeconds]);

  useEffect(() => {
    if (!isRunning || seconds <= 0) return;
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onFinish?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, seconds, onFinish]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const adjustTime = (delta: number) => {
    setSeconds((prev) => Math.max(0, prev + delta));
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl border border-emerald-500/40 bg-card/90 backdrop-blur-md shadow-xl text-xs text-foreground animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center gap-2">
        <Timer className="w-4 h-4 text-emerald-500 animate-pulse" />
        <span className="font-mono font-bold text-sm text-emerald-400">
          {formatTime(seconds)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => adjustTime(-15)}
          className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono"
        >
          -15s
        </button>

        <button
          type="button"
          onClick={() => setIsRunning(!isRunning)}
          className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
        >
          {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => adjustTime(15)}
          className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono"
        >
          +15s
        </button>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-muted-foreground hover:text-foreground ml-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
