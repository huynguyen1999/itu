import { RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export function FeatureSettingsReset({ onReset, label = 'Reset settings' }: { onReset: () => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Restore the default settings for this feature.</p>
      <Button type="button" variant="outline" size="sm" onClick={onReset}>
        <RotateCcw className="h-3.5 w-3.5" />
        {label}
      </Button>
    </div>
  );
}
