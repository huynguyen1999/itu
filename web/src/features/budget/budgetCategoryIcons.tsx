import type { LucideIcon } from 'lucide-react';
import {
  Car,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  MoreHorizontal,
  PartyPopper,
  Plane,
  ReceiptText,
  ShoppingBag,
  Tag,
  Utensils,
} from 'lucide-react';

export const CATEGORY_ICON_OPTIONS: readonly [string, LucideIcon][] = [
  ['food', Utensils],
  ['shopping', ShoppingBag],
  ['transport', Car],
  ['bills', ReceiptText],
  ['health', HeartPulse],
  ['fitness', Dumbbell],
  ['education', GraduationCap],
  ['entertainment', PartyPopper],
  ['travel', Plane],
  ['other', MoreHorizontal],
];

export const CATEGORY_COLOR_OPTIONS = [
  ['TEAL', 'Teal', 'text-primary', 'bg-primary/10', 'bg-primary'],
  ['EMERALD', 'Emerald', 'text-emerald-600 dark:text-emerald-400', 'bg-emerald-500/10', 'bg-emerald-500'],
  ['BLUE', 'Blue', 'text-blue-600 dark:text-blue-400', 'bg-blue-500/10', 'bg-blue-500'],
  ['VIOLET', 'Violet', 'text-violet-600 dark:text-violet-400', 'bg-violet-500/10', 'bg-violet-500'],
  ['AMBER', 'Amber', 'text-amber-600 dark:text-amber-400', 'bg-amber-500/10', 'bg-amber-500'],
  ['ROSE', 'Rose', 'text-rose-600 dark:text-rose-400', 'bg-rose-500/10', 'bg-rose-500'],
  ['INDIGO', 'Indigo', 'text-indigo-600 dark:text-indigo-400', 'bg-indigo-500/10', 'bg-indigo-500'],
  ['SLATE', 'Slate', 'text-slate-600 dark:text-slate-400', 'bg-slate-500/10', 'bg-slate-500'],
] as const;

const CATEGORY_ICON_ALIASES: Record<string, string> = {
  utensils: 'food',
  car: 'transport',
  shoppingbag: 'shopping',
  receipt: 'bills',
  heart: 'health',
  tv: 'entertainment',
  folder: 'other',
  groceries: 'shopping',
  grocery: 'shopping',
  transportation: 'transport',
};

export function getCategoryIconKey(name?: string): string {
  const normalized = name?.trim().toLowerCase().replace(/[\s-]+/g, '_') || 'other';
  return CATEGORY_ICON_ALIASES[normalized] || normalized;
}

export function getCategoryColorKey(color?: string): string {
  const normalized = color?.trim().toUpperCase() || 'TEAL';
  return CATEGORY_COLOR_OPTIONS.some(([key]) => key === normalized) ? normalized : 'TEAL';
}

export function getCategoryColorClasses(color?: string) {
  const key = getCategoryColorKey(color);
  const option = CATEGORY_COLOR_OPTIONS.find(([optionKey]) => optionKey === key) ?? CATEGORY_COLOR_OPTIONS[0];
  return { icon: option[2], background: option[3], dot: option[4] };
}

function getCategoryIcon(name?: string): LucideIcon {
  const key = getCategoryIconKey(name);
  return CATEGORY_ICON_OPTIONS.find(([option]) => option === key)?.[1] ?? Tag;
}

export function CategoryIcon({ name, color, className = 'h-4 w-4' }: { name?: string; color?: string; className?: string }) {
  const Icon = getCategoryIcon(name);
  return <Icon className={`${className} ${getCategoryColorClasses(color).icon}`} aria-hidden="true" />;
}
