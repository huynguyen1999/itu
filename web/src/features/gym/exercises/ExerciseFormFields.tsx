import React, { useRef, useState } from 'react';
import { Check, UploadCloud } from 'lucide-react';
import type { ExerciseMetricType } from '../gymQueries';

const METRIC_OPTIONS = [
  { value: 'WEIGHT_REPS', label: 'Weight & reps' },
  { value: 'REPS', label: 'Reps only' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'DISTANCE_DURATION', label: 'Distance & duration' },
] as const satisfies ReadonlyArray<{ value: ExerciseMetricType; label: string }>;

export type MetricType = (typeof METRIC_OPTIONS)[number]['value'];

export function SegmentedMetricControl({
  value,
  onChange,
}: {
  value: MetricType;
  onChange: (value: MetricType) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-muted/50 border border-border/80 rounded-xl"
      role="radiogroup"
      aria-label="Metric type"
    >
      {METRIC_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-2 text-xs font-mono font-medium rounded-lg transition-all duration-150 text-center select-none ${
              isActive
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ImageDropzone({
  file,
  existingUrl,
  onFileSelect,
  isRequired = true,
}: {
  file: File | null;
  existingUrl?: string | null;
  onFileSelect: (file: File | null) => void;
  isRequired?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = file ? URL.createObjectURL(file) : existingUrl || null;
  const hasImage = Boolean(previewUrl);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) onFileSelect(droppedFile);
  };

  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative flex items-center gap-3 p-3.5 border border-dashed rounded-xl cursor-pointer transition-all duration-150 ${
        isDragging
          ? 'border-emerald-500 bg-emerald-500/10'
          : hasImage
            ? 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-500 hover:bg-emerald-500/10'
            : 'border-border/80 bg-muted/20 hover:border-emerald-500/60 hover:bg-emerald-500/5'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        onChange={(event) => onFileSelect(event.target.files?.[0] || null)}
        className="hidden"
      />

      <div className="w-10 h-10 min-w-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border/60 text-muted-foreground group-hover:text-emerald-500 transition-colors">
        {hasImage ? (
          <img src={previewUrl!} alt="Reference preview" className="w-full h-full object-cover" />
        ) : (
          <UploadCloud className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {file ? file.name : hasImage ? 'Reference image attached' : 'Choose reference image'}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {hasImage ? 'Click or drag to replace image' : 'PNG or JPG, up to 5 MB'}
        </p>
      </div>

      {hasImage ? (
        <span className="font-mono text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
          <Check className="w-3 h-3" />
          Attached
        </span>
      ) : isRequired ? (
        <span className="font-mono text-[10px] uppercase font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-md">
          Required
        </span>
      ) : (
        <span className="font-mono text-[10px] uppercase font-medium text-muted-foreground bg-muted border border-border/50 px-2 py-0.5 rounded-md">
          Optional
        </span>
      )}
    </div>
  );
}
