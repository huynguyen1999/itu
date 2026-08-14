import type { ReactNode } from 'react';
import type { TaskTag } from '@/shared/api/types';

export function TagSelector({
  label,
  tags,
  selectedTagIds,
  onChange,
  disabled = false,
}: {
  label?: string;
  tags: TaskTag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}) {
  if (!tags.length) return null;
  return (
    <fieldset>
      {label ? <legend className="mb-2 text-xs font-semibold text-muted-foreground">{label}</legend> : null}
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
        {tags.map((tag) => {
          const selected = selectedTagIds.includes(tag.id);
          return (
            <button
              type="button"
              key={tag.id}
              disabled={disabled}
              onClick={() =>
                onChange(selected ? selectedTagIds.filter((id) => id !== tag.id) : [...selectedTagIds, tag.id])
              }
              aria-pressed={selected}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              #{tag.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
export function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xs uppercase font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}
