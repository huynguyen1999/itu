import { Beaker, BookOpen, Brain, Calculator, Code2, Globe2, Inbox, Languages, Leaf } from 'lucide-react';
import type { DeckColor, DeckIcon } from '@/shared/api/types';

const deckIconOptions: Array<{ value: DeckIcon; label: string; icon: typeof Inbox }> = [
  { value: 'INBOX', label: 'Inbox', icon: Inbox },
  { value: 'BOOK', label: 'Book', icon: BookOpen },
  { value: 'BRAIN', label: 'Brain', icon: Brain },
  { value: 'LANGUAGE', label: 'Language', icon: Languages },
  { value: 'FLASK', label: 'Flask', icon: Beaker },
  { value: 'CODE', label: 'Code', icon: Code2 },
  { value: 'LEAF', label: 'Leaf', icon: Leaf },
  { value: 'CALCULATOR', label: 'Calculator', icon: Calculator },
  { value: 'GLOBE', label: 'Globe', icon: Globe2 },
];

const deckColorOptions: Array<{
  value: DeckColor;
  label: string;
  iconClass: string;
  railClass: string;
  softClass: string;
}> = [
  {
    value: 'SLATE',
    label: 'Slate',
    iconClass: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
    railClass: 'bg-slate-500',
    softClass: 'bg-slate-50 dark:bg-slate-500/10',
  },
  {
    value: 'EMERALD',
    label: 'Emerald',
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
    railClass: 'bg-emerald-500',
    softClass: 'bg-emerald-50 dark:bg-emerald-400/10',
  },
  {
    value: 'TEAL',
    label: 'Teal',
    iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-200',
    railClass: 'bg-teal-500',
    softClass: 'bg-teal-50 dark:bg-teal-400/10',
  },
  {
    value: 'BLUE',
    label: 'Blue',
    iconClass: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200',
    railClass: 'bg-blue-500',
    softClass: 'bg-blue-50 dark:bg-blue-400/10',
  },
  {
    value: 'INDIGO',
    label: 'Indigo',
    iconClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200',
    railClass: 'bg-indigo-500',
    softClass: 'bg-indigo-50 dark:bg-indigo-400/10',
  },
  {
    value: 'VIOLET',
    label: 'Violet',
    iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
    railClass: 'bg-violet-500',
    softClass: 'bg-violet-50 dark:bg-violet-400/10',
  },
  {
    value: 'ROSE',
    label: 'Rose',
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200',
    railClass: 'bg-rose-500',
    softClass: 'bg-rose-50 dark:bg-rose-400/10',
  },
  {
    value: 'AMBER',
    label: 'Amber',
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
    railClass: 'bg-amber-500',
    softClass: 'bg-amber-50 dark:bg-amber-400/10',
  },
];

export function getDeckStyle(icon: DeckIcon, color: DeckColor) {
  return {
    Icon: deckIconOptions.find((item) => item.value === icon)?.icon ?? BookOpen,
    color: deckColorOptions.find((item) => item.value === color) ?? deckColorOptions[2],
  };
}

export function DeckStylePicker({
  icon,
  color,
  onIconChange,
  onColorChange,
}: {
  icon: DeckIcon;
  color: DeckColor;
  onIconChange: (value: DeckIcon) => void;
  onColorChange: (value: DeckColor) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Icon</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Deck icon">
          {deckIconOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={icon === option.value}
              aria-label={option.label}
              onClick={() => onIconChange(option.value)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                icon === option.value
                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <option.icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Deck color">
          {deckColorOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={color === option.value}
              aria-label={option.label}
              onClick={() => onColorChange(option.value)}
              className={`h-8 w-8 rounded-full border-4 border-background shadow-sm ${option.railClass} ${
                color === option.value ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
