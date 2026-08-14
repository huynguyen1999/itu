interface DailyStreakBadgeProps {
  value: number | string;
  label?: string;
  isRevision?: boolean;
}

export function DailyStreakBadge({
  value,
  label = 'Day streak',
  isRevision = false,
}: DailyStreakBadgeProps) {
  return (
    <div className="itu-daily-streak">
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle
          cx="28"
          cy="28"
          r="25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-border/40"
        />
        <circle
          cx="28"
          cy="28"
          r="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-border/40"
        />
        <circle
          cx="28"
          cy="28"
          r="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary/40"
        />
        <circle
          cx="28"
          cy="28"
          r="25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="157"
          strokeDashoffset={isRevision ? "50" : "27"}
          strokeLinecap="round"
          className="text-[var(--itu-teal-400)] transition-all duration-700"
          transform="rotate(-90 28 28)"
        />
      </svg>
      <div className="itu-daily-streak-copy">
        <div className="itu-daily-streak-num">{value}</div>
        <div className="itu-daily-streak-label">{label}</div>
      </div>
    </div>
  );
}
