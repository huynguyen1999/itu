import type { ReactNode } from 'react';

export function FeatureSettingsRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
