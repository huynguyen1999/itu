import { useState, useEffect } from 'react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Timer, X } from 'lucide-react';

interface RestTimerProps {
  initialSeconds: number;
  onClose: () => void;
  soundEnabled?: boolean;
}

export function playGymTone(enabled: boolean, frequency = 660) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    oscillator.addEventListener('ended', () => void context.close());
  } catch {
    // Audio is optional; browser autoplay/device restrictions should not affect logging.
  }
}

export function RestTimer({ initialSeconds, onClose, soundEnabled = true }: RestTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0) playGymTone(soundEnabled);
  }, [secondsLeft, soundEnabled]);

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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSecondsLeft((s) => Math.max(0, s - 15))}
          className="h-7 text-xs"
        >
          -15s
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
          Skip
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSecondsLeft((s) => s + 15)} className="h-7 text-xs">
          +15s
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}
