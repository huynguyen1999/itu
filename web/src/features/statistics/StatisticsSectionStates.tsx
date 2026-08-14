import { Button } from '@/shared/ui/button';

export function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive"
      role="alert"
    >
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
