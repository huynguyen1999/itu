import { useState, useEffect } from 'react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Timer, X } from 'lucide-react';

interface RestTimerProps {
  initialSeconds: number;
  onClose: () => void;
}

export function RestTimer({ initialSeconds, onClose }: RestTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  return (
    <Card className="p-3 bg-emerald-500/10 border-emerald-500/30 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <Timer className="w-4 h-4 animate-pulse" />
        <span>Rest Timer:</span>
        <span className="font-mono text-sm font-bold">
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setSecondsLeft((s) => s + 30)} className="text-xs h-7">
          +30s
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}
