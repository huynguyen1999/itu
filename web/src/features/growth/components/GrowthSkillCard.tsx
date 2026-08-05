import type { CSSProperties } from 'react';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ImagePlus } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthOverview } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { AuthenticatedImage } from '@/shared/ui/AuthenticatedImage';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { GrowthAttributeMappingEditor } from './GrowthAttributeMappingEditor';
import { GROWTH_KIND } from '@/shared/constants/growth.constants';
import {
  growthColorClasses,
  GrowthIconMark,
  growthIconLabel,
  growthIconOptions,
  growthSolidColorClasses,
  isPresetGrowthIcon,
  isUploadedGrowthIcon,
} from '@/shared/ui/GrowthIcons';
import { growthIconValue } from './GrowthDialogs';
import { Progress } from './GrowthPrimitives';

const editGrowthColors = [
  { value: 'BLUE', swatch: '#3b82f6' },
  { value: 'VIOLET', swatch: '#8b5cf6' },
  { value: 'TEAL', swatch: '#14b8a6' },
  { value: 'EMERALD', swatch: '#10b981' },
  { value: 'AMBER', swatch: '#f59e0b' },
  { value: 'ORANGE', swatch: '#f97316' },
  { value: 'ROSE', swatch: '#f43f5e' },
] as const;

const defaultCustomGrowthColor = '#8b5cf6';
const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

function isHexColor(value: string) {
  return hexColorPattern.test(value.trim());
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  return isHexColor(trimmed) ? trimmed.toUpperCase() : defaultCustomGrowthColor.toUpperCase();
}

function growthCustomColorStyle(color: string) {
  if (!isHexColor(color)) return undefined;
  return {
    backgroundColor: `${color}1A`,
    color,
    '--tw-ring-color': `${color}33`,
  } as CSSProperties;
}

function EditGrowthAppearanceFields({ skill }: { skill: GrowthOverview['skills'][number] }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedIcon, setSelectedIcon] = useState(isPresetGrowthIcon(skill.icon) ? skill.icon : 'CUSTOM');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState(skill.color || 'VIOLET');
  const [customColor, setCustomColor] = useState(
    isHexColor(skill.color) ? normalizeHexColor(skill.color) : defaultCustomGrowthColor.toUpperCase(),
  );
  const uploadedIcon = isUploadedGrowthIcon(skill.icon);
  const selectedIconLabel = selectedIcon === 'CUSTOM' ? 'Custom icon' : growthIconLabel(selectedIcon);
  const submittedColor = isHexColor(selectedColor) ? normalizeHexColor(selectedColor) : selectedColor;
  const iconPreview =
    uploadedIcon && selectedIcon === 'CUSTOM' ? (
      <AuthenticatedImage src={skill.icon} alt="" className="h-full w-full object-cover" />
    ) : (
      <GrowthIconMark icon={selectedIcon === 'CUSTOM' ? skill.icon : selectedIcon} className="h-4 w-4" />
    );

  return (
    <div className="space-y-3">
      {/* Icon picker — compact trigger + dropdown */}
      <div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={iconPickerOpen}
            onClick={() => setIconPickerOpen((open) => !open)}
            className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={`Icon: ${selectedIconLabel}`}
          >
            {iconPreview}
          </button>
          <span className="text-xs font-semibold text-muted-foreground">{selectedIconLabel}</span>
        </div>
        {iconPickerOpen && (
          <div className="mt-2 rounded-xl border border-border bg-background p-2 shadow-sm">
            <div className="grid max-h-48 grid-cols-8 gap-1.5 overflow-y-auto pr-1">
              {growthIconOptions.map(({ value, label }) => {
                const selected = selectedIcon === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedIcon(value);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                    className={`grid h-9 place-items-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted'
                    }`}
                  >
                    <GrowthIconMark icon={value} className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selectedIcon === 'CUSTOM'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Upload custom icon
            </button>
          </div>
        )}
        <Input
          ref={fileRef}
          name="iconFile"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.[0]) setSelectedIcon('CUSTOM');
          }}
        />
        <input type="hidden" name="icon" value={selectedIcon === 'CUSTOM' ? skill.icon : selectedIcon} />
      </div>

      {/* Color — preset dots + custom color swatch inline */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {editGrowthColors.map(({ value, swatch }) => {
            const selected = selectedColor === value;
            return (
              <button
                key={value}
                type="button"
                aria-label={`${value.toLowerCase()} color`}
                aria-pressed={selected}
                onClick={() => setSelectedColor(value)}
                className={`grid h-7 w-7 place-items-center rounded-full ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected ? 'ring-2 ring-foreground' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: swatch }}
              >
                {selected ? <CheckCircle2 className="h-3.5 w-3.5 text-white drop-shadow-sm" /> : null}
              </button>
            );
          })}
          <div className="relative grid h-7 w-7 place-items-center">
            <span
              className="absolute inset-0 rounded-full ring-1 ring-border"
              style={{ backgroundColor: isHexColor(customColor) ? customColor : defaultCustomGrowthColor }}
            >
              {isHexColor(selectedColor) && (
                <CheckCircle2 className="h-3.5 w-3.5 text-white drop-shadow-sm absolute inset-0 m-auto" />
              )}
            </span>
            <Label htmlFor={`growth-custom-color-${skill.id}`} className="sr-only">
              Custom color
            </Label>
            <Input
              id={`growth-custom-color-${skill.id}`}
              type="color"
              value={isHexColor(customColor) ? customColor : defaultCustomGrowthColor}
              onChange={(event) => {
                const value = normalizeHexColor(event.target.value);
                setCustomColor(value);
                setSelectedColor(value);
              }}
              className="h-7 w-7 cursor-pointer rounded-full border-0 p-0 opacity-0"
              aria-label="Choose a custom color"
            />
          </div>
        </div>
        <input type="hidden" name="color" value={submittedColor} />
      </div>
    </div>
  );
}

export function SkillCard({ skill }: { skill: GrowthOverview['skills'][number] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [baseXp, setBaseXp] = useState(skill.baseXp);
  const iconTone = growthColorClasses[skill.color] ?? growthColorClasses.VIOLET;
  const customIconTone = growthCustomColorStyle(skill.color);
  const progressPercent = Math.min(100, Math.max(0, (skill.progressXp / Math.max(1, skill.requiredXp)) * 100));
  const update = useMutation({
    mutationFn: async (form: FormData) =>
      api.updateGrowthSkill(skill.id, {
        name: String(form.get('name')),
        description: String(form.get('description')),
        icon: await growthIconValue(form),
        color: String(form.get('color')),
        baseXp: Number(form.get('baseXp')),
      }),
    onSuccess: async () => {
      setEditing(false);
    },
  });
  const archive = useMutation({
    mutationFn: () => api.updateGrowthSkill(skill.id, { archived: true }),
  });
  return (
    <>
      <article className="growth-card group min-w-0 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <CircularSkillIcon
              icon={skill.icon}
              tone={iconTone}
              toneStyle={customIconTone}
              progressPercent={progressPercent}
            />
            <div className="min-w-0">
              <span className="growth-card__label">Level {skill.level}</span>
              <h3 className="mt-1 truncate text-lg font-black">{skill.name}</h3>
              <p className="mt-1 min-h-10 break-words text-sm leading-5 text-muted-foreground">
                {skill.description || 'Progress built through completed work.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
          >
            Edit
          </button>
        </div>
        <Progress value={skill.progressXp} max={skill.requiredXp} />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {skill.progressXp} / {skill.requiredXp} this level
          </span>
          <span>{skill.currentXp} total XP</span>
        </div>
        <GrowthAttributeMappingEditor skill={skill} />
      </article>

      <Dialog
        open={editing}
        onOpenChange={(open) => {
          setEditing(open);
          if (open) setBaseXp(skill.baseXp);
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg gap-0 overflow-y-auto rounded-2xl border-border/80 bg-card p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 px-5 py-4 pr-14 text-left sm:px-6 sm:py-5">
            <DialogTitle className="text-xl font-black tracking-tight sm:text-2xl">
              Edit {skill.kind === GROWTH_KIND.ATTRIBUTE ? 'attribute' : 'skill'}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 px-5 py-5 sm:px-6"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(new FormData(event.currentTarget));
            }}
          >
            {/* Name + appearance row */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <Input
                  id={`growth-name-${skill.id}`}
                  name="name"
                  defaultValue={skill.name}
                  required
                  className="h-10 rounded-xl bg-background px-4 text-base font-semibold"
                  placeholder="Name"
                />
              </div>
              <EditGrowthAppearanceFields key={`${skill.id}-${editing}`} skill={skill} />
            </div>

            {/* Description */}
            <div>
              <Textarea
                id={`growth-description-${skill.id}`}
                name="description"
                className="min-h-20 resize-y rounded-xl bg-background p-3.5 text-sm"
                defaultValue={skill.description}
                placeholder="Description (optional)"
              />
            </div>

            {/* Base XP */}
            <div>
              <Label htmlFor={`growth-base-xp-${skill.id}`} className="text-xs font-bold text-muted-foreground">
                XP needed for level 2
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-9 shrink-0 rounded-lg p-0 text-lg"
                  aria-label="Decrease XP needed"
                  onClick={() => setBaseXp((value) => Math.max(10, value - 10))}
                >
                  −
                </Button>
                <Input
                  id={`growth-base-xp-${skill.id}`}
                  name="baseXp"
                  type="number"
                  min="10"
                  max="10000"
                  value={baseXp}
                  onChange={(event) => setBaseXp(Math.min(10000, Math.max(10, Number(event.target.value) || 10)))}
                  className="h-9 w-20 rounded-lg bg-background text-center text-base font-bold tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-9 shrink-0 rounded-lg p-0 text-lg"
                  aria-label="Increase XP needed"
                  onClick={() => setBaseXp((value) => Math.min(10000, value + 10))}
                >
                  +
                </Button>
                <div className="ml-auto flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                  <span>Lv1</span>
                  <span className="h-1 w-8 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full w-1/3 rounded-full bg-primary" />
                  </span>
                  <span>Lv2</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="sm:min-w-24"
                disabled={archive.isPending}
                onClick={() => setConfirmArchiveOpen(true)}
              >
                Remove
              </Button>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="sm:min-w-24"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" className="sm:min-w-28" disabled={update.isPending}>
                  {update.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
            {update.error instanceof Error ? (
              <p className="text-sm text-destructive" role="alert">
                {update.error.message}
              </p>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={`Remove ${skill.name}?`}
        description="Its history will stay in the ledger."
        confirmLabel="Remove"
        isPending={archive.isPending}
        onConfirm={() => archive.mutate(undefined, { onSuccess: () => setConfirmArchiveOpen(false) })}
      />
    </>
  );
}

function CircularSkillIcon({
  icon,
  tone,
  toneStyle,
  progressPercent,
}: {
  icon: string;
  tone: string;
  toneStyle?: CSSProperties;
  progressPercent: number;
}) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progressPercent / 100) * circumference;

  return (
    <span
      className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${tone}`}
      style={toneStyle}
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="relative z-10 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-background/80">
        <GrowthIconMark icon={icon} />
      </span>
    </span>
  );
}
