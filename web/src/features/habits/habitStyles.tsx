// Habit visual identity: a curated emoji + color vocabulary.
//
// Habits store their `icon` as an emoji string and their `color` as a palette
// key. Both web (HabitsPage) and the macOS client render the icon as a short
// emoji marker (`slice(0, 2)` / `prefix(2)`), so every option here is a single
// emoji without ZWJ or variation-selector sequences to keep cross-platform
// rendering identical.

export const DEFAULT_HABIT_ICON = '✅';
export const DEFAULT_HABIT_COLOR = 'EMERALD';

interface HabitIconOption {
  value: string;
  label: string;
}

const habitIconOptions: HabitIconOption[] = [
  // Daily core
  { value: '✅', label: 'Check in' },
  { value: '🎯', label: 'Target' },
  { value: '📅', label: 'Schedule' },
  { value: '⭐', label: 'Star' },
  { value: '🔥', label: 'Streak' },
  { value: '⚡', label: 'Momentum' },
  { value: '🏆', label: 'Trophy' },
  { value: '💯', label: 'Perfect' },
  // Hydration & food
  { value: '💧', label: 'Water' },
  { value: '☕', label: 'Coffee' },
  { value: '🍵', label: 'Tea' },
  { value: '🍎', label: 'Fruit' },
  { value: '🥗', label: 'Salad' },
  // Fitness & rest
  { value: '💪', label: 'Workout' },
  { value: '🏃', label: 'Run' },
  { value: '🚶', label: 'Walk' },
  { value: '🧘', label: 'Meditate' },
  { value: '😴', label: 'Sleep' },
  { value: '🛌', label: 'Early night' },
  // Mind & create
  { value: '📖', label: 'Read' },
  { value: '📚', label: 'Study' },
  { value: '🧠', label: 'Brain training' },
  { value: '🎓', label: 'Learn' },
  { value: '📝', label: 'Write' },
  { value: '🎨', label: 'Create' },
  // Nature & home
  { value: '🌱', label: 'Nurture' },
  { value: '🌿', label: 'Nature' },
  { value: '🌳', label: 'Outdoors' },
  { value: '🌊', label: 'Calm' },
  { value: '🏠', label: 'Home' },
  { value: '🧹', label: 'Tidy' },
  { value: '🐕', label: 'Walk dog' },
  { value: '🪴', label: 'Water plants' },
  // Limit behavior
  { value: '🚭', label: 'No smoking' },
  { value: '📵', label: 'No phone' },
  { value: '🍬', label: 'Less sugar' },
  { value: '🍷', label: 'Less alcohol' },
];

const habitIconSet = new Set(habitIconOptions.map((option) => option.value));

export function isHabitIcon(value?: string | null): boolean {
  return !!value && habitIconSet.has(value);
}

interface HabitColorOption {
  value: string;
  label: string;
  iconClass: string;
  railClass: string;
}

const habitColorOptions: HabitColorOption[] = [
  {
    value: 'EMERALD',
    label: 'Emerald',
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
    railClass: 'bg-emerald-500',
  },
  {
    value: 'TEAL',
    label: 'Teal',
    iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-200',
    railClass: 'bg-teal-500',
  },
  {
    value: 'BLUE',
    label: 'Blue',
    iconClass: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200',
    railClass: 'bg-blue-500',
  },
  {
    value: 'INDIGO',
    label: 'Indigo',
    iconClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200',
    railClass: 'bg-indigo-500',
  },
  {
    value: 'VIOLET',
    label: 'Violet',
    iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
    railClass: 'bg-violet-500',
  },
  {
    value: 'ROSE',
    label: 'Rose',
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200',
    railClass: 'bg-rose-500',
  },
  {
    value: 'AMBER',
    label: 'Amber',
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
    railClass: 'bg-amber-500',
  },
  {
    value: 'SLATE',
    label: 'Slate',
    iconClass: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
    railClass: 'bg-slate-500',
  },
];

export function isHabitColor(value?: string | null): value is string {
  return !!value && habitColorOptions.some((option) => option.value === value);
}

function habitColorClass(color?: string | null) {
  return (
    (isHabitColor(color) ? habitColorOptions.find((option) => option.value === color) : null) ?? habitColorOptions[0]
  );
}

export function HabitIconBadge({
  icon,
  color = DEFAULT_HABIT_COLOR,
  className = '',
}: {
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  const tone = habitColorClass(color);
  // Render a curated emoji as-is; render any other stored marker (e.g. legacy
  // values) with its first two code units, matching the incumbent behavior.
  const glyph = isHabitIcon(icon) ? icon : icon ? icon.slice(0, 2) : DEFAULT_HABIT_ICON;
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold ${tone.iconClass} ${className}`}
      aria-hidden="true"
    >
      {glyph}
    </div>
  );
}

export function HabitStylePicker({
  icon,
  color,
  onIconChange,
  onColorChange,
}: {
  icon: string;
  color: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Icon</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Habit icon">
          {habitIconOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={icon === option.value}
              aria-label={option.label}
              title={option.label}
              onClick={() => onIconChange(option.value)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition ${
                icon === option.value
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <span aria-hidden="true">{option.value}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Habit color">
          {habitColorOptions.map((option) => (
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
