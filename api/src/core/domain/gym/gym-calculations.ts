import {
  ExerciseDomain,
  ExerciseMetricType,
  GymExerciseProgressDomain,
  GymOverviewDomain,
  GymPRRecordDomain,
  GymPRType,
  GymProgressPointDomain,
  GymSetPRDomain,
  WorkoutDomain,
  WorkoutSetDomain,
} from './gym.domain';

export function calculateE1RM(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (weight === null || weight === undefined || weight <= 0) return null;
  if (reps === null || reps === undefined || reps <= 0) return null;
  if (reps === 1) return Math.round(weight * 10) / 10;
  // Epley formula: weight * (1 + reps / 30)
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function isWorkingSet(set: { type?: string | null; completedAt?: Date | string | null }): boolean {
  if (!set.completedAt) return false;
  const type = set.type ? String(set.type).toUpperCase() : 'NORMAL';
  return type !== 'WARM_UP' && type !== 'WARMUP';
}

export function detectSetPRs(
  set: WorkoutSetDomain,
  metricType: ExerciseMetricType,
  exerciseName: string,
  exerciseId: string,
  priorCompletedSets: WorkoutSetDomain[],
): GymSetPRDomain | null {
  if (!isWorkingSet(set)) return null;

  const priorWorking = priorCompletedSets.filter(isWorkingSet);
  const prTypes: GymPRType[] = [];

  const weight = set.weight !== null && set.weight !== undefined ? Number(set.weight) : null;
  const reps = set.reps !== null && set.reps !== undefined ? Number(set.reps) : null;
  const duration = set.durationSeconds !== null && set.durationSeconds !== undefined ? Number(set.durationSeconds) : null;
  const distance = set.distanceMeters !== null && set.distanceMeters !== undefined ? Number(set.distanceMeters) : null;

  const currentE1RM = calculateE1RM(weight, reps);
  let prevE1RM: number | null = null;
  let prevWeight: number | null = null;
  let prevReps: number | null = null;
  let prevSetVol: number | null = null;
  let prevDuration: number | null = null;
  let prevDistance: number | null = null;

  for (const s of priorWorking) {
    const sw = s.weight !== null && s.weight !== undefined ? Number(s.weight) : null;
    const sr = s.reps !== null && s.reps !== undefined ? Number(s.reps) : null;
    const sd = s.durationSeconds !== null && s.durationSeconds !== undefined ? Number(s.durationSeconds) : null;
    const sm = s.distanceMeters !== null && s.distanceMeters !== undefined ? Number(s.distanceMeters) : null;

    if (sw !== null && (prevWeight === null || sw > prevWeight)) prevWeight = sw;
    if (sr !== null && (prevReps === null || sr > prevReps)) prevReps = sr;
    if (sd !== null && (prevDuration === null || sd > prevDuration)) prevDuration = sd;
    if (sm !== null && (prevDistance === null || sm > prevDistance)) prevDistance = sm;

    if (sw !== null && sr !== null) {
      const vol = sw * sr;
      if (prevSetVol === null || vol > prevSetVol) prevSetVol = vol;
      const e1rm = calculateE1RM(sw, sr);
      if (e1rm !== null && (prevE1RM === null || e1rm > prevE1RM)) prevE1RM = e1rm;
    }
  }

  if (metricType === 'WEIGHT_REPS') {
    if (weight !== null && (prevWeight === null || weight > prevWeight)) {
      prTypes.push('HEAVIEST_WEIGHT');
    }
    if (currentE1RM !== null && (prevE1RM === null || currentE1RM > prevE1RM)) {
      prTypes.push('ESTIMATED_1RM');
    }
    if (reps !== null && (prevReps === null || reps > prevReps)) {
      prTypes.push('MOST_REPS');
    }
    if (weight !== null && reps !== null) {
      const vol = weight * reps;
      if (prevSetVol === null || vol > prevSetVol) {
        prTypes.push('BEST_SET_VOLUME');
      }
    }
  } else if (metricType === 'REPS') {
    if (reps !== null && (prevReps === null || reps > prevReps)) {
      prTypes.push('MOST_REPS');
    }
  } else if (metricType === 'DURATION') {
    if (duration !== null && (prevDuration === null || duration > prevDuration)) {
      prTypes.push('LONGEST_DURATION');
    }
  } else if (metricType === 'DISTANCE_DURATION') {
    if (distance !== null && (prevDistance === null || distance > prevDistance)) {
      prTypes.push('LONGEST_DISTANCE');
    }
    if (duration !== null && (prevDuration === null || duration > prevDuration)) {
      prTypes.push('LONGEST_DURATION');
    }
  }

  if (prTypes.length === 0) return null;

  return {
    exerciseId,
    exerciseName,
    setId: set.id,
    prTypes,
    value: weight ?? duration ?? distance ?? reps ?? 0,
    previousValue: prevWeight ?? prevDuration ?? prevDistance ?? prevReps ?? null,
    estimated1RM: currentE1RM,
    previousEstimated1RM: prevE1RM,
  };
}

export function detectWorkoutPRs(
  currentWorkout: WorkoutDomain,
  historicalWorkouts: WorkoutDomain[],
): GymPRRecordDomain[] {
  const prs: GymPRRecordDomain[] = [];
  const achievedDate = currentWorkout.endedAt ?? currentWorkout.startedAt ?? currentWorkout.createdAt;

  // Flatten prior completed sets grouped by exerciseId
  const priorSetsByExercise = new Map<string, WorkoutSetDomain[]>();
  for (const w of historicalWorkouts) {
    if (w.id === currentWorkout.id || w.status !== 'COMPLETED') continue;
    for (const ex of w.exercises) {
      const list = priorSetsByExercise.get(ex.exerciseId) || [];
      for (const s of ex.sets) {
        if (isWorkingSet(s)) list.push(s);
      }
      priorSetsByExercise.set(ex.exerciseId, list);
    }
  }

  for (const ex of currentWorkout.exercises) {
    const priorSets = priorSetsByExercise.get(ex.exerciseId) || [];
    const metricType = ex.metricType || ex.exercise?.metricType || 'WEIGHT_REPS';
    const name = ex.exerciseName || ex.exercise?.name || 'Exercise';

    for (const s of ex.sets) {
      if (!isWorkingSet(s)) continue;
      const detected = detectSetPRs(s, metricType, name, ex.exerciseId, priorSets);
      if (detected) {
        for (const prType of detected.prTypes) {
          prs.push({
            type: prType,
            value: detected.value,
            previousValue: detected.previousValue,
            reps: s.reps ?? null,
            weight: s.weight ?? null,
            achievedAt: achievedDate,
            workoutId: currentWorkout.id,
            exerciseId: ex.exerciseId,
            exerciseName: name,
          });
        }
      }
      // Add current set to prior sets so subsequent sets in same workout compare against it
      priorSets.push(s);
    }
  }

  return prs;
}

export function calculateMuscleDistribution(workouts: WorkoutDomain[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const w of workouts) {
    if (w.status !== 'COMPLETED') continue;
    for (const ex of w.exercises) {
      const muscle = ex.exercise?.primaryMuscleGroup?.trim() || 'General';
      const workingSetsCount = ex.sets.filter(isWorkingSet).length;
      if (workingSetsCount > 0) {
        distribution[muscle] = (distribution[muscle] || 0) + workingSetsCount;
      }
    }
  }
  return distribution;
}

export function getWeekBoundaries(date: Date): { startOfWeek: Date; endOfWeek: Date } {
  const d = new Date(date);
  const day = d.getDay();
  // Monday as first day of week: 0 (Sun) -> diff -6, 1 (Mon) -> diff 0, ..., 6 (Sat) -> diff -5
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(d.setDate(diff));
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return { startOfWeek, endOfWeek };
}

export function calculateWeeklyConsistencyStreak(
  completedWorkouts: WorkoutDomain[],
  weeklyTarget: number | null | undefined,
  referenceDate: Date = new Date(),
): number {
  if (!weeklyTarget || weeklyTarget <= 0) return 0;

  // Group workouts by ISO week key: YYYY-Www
  const workoutsByWeek = new Map<string, number>();
  for (const w of completedWorkouts) {
    if (w.status !== 'COMPLETED') continue;
    const date = w.startedAt ? new Date(w.startedAt) : new Date(w.createdAt);
    const weekKey = getISOWeekKey(date);
    workoutsByWeek.set(weekKey, (workoutsByWeek.get(weekKey) || 0) + 1);
  }

  const { startOfWeek: currentWeekStart } = getWeekBoundaries(referenceDate);
  let streak = 0;

  // Check the current active week
  const currentWeekKey = getISOWeekKey(currentWeekStart);
  const currentCount = workoutsByWeek.get(currentWeekKey) || 0;
  if (currentCount >= weeklyTarget) {
    streak++;
  }

  // Iterate backwards through past completed weeks
  const checkDate = new Date(currentWeekStart);
  for (let i = 1; i <= 104; i++) {
    checkDate.setDate(checkDate.getDate() - 7);
    const key = getISOWeekKey(checkDate);
    const count = workoutsByWeek.get(key) || 0;
    if (count >= weeklyTarget) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function getISOWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function filterByDateRange<T extends { startedAt?: Date | null; createdAt?: Date }>(
  items: T[],
  range: '1M' | '3M' | '6M' | '1Y' | 'ALL',
  now: Date = new Date(),
): T[] {
  if (range === 'ALL') return items;
  const cutoff = new Date(now);
  if (range === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (range === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);

  return items.filter((item) => {
    const itemDate = item.startedAt ? new Date(item.startedAt) : item.createdAt ? new Date(item.createdAt) : null;
    return itemDate && itemDate >= cutoff;
  });
}

export function buildExerciseProgress(
  exercise: ExerciseDomain,
  completedSets: WorkoutSetDomain[],
  range: '1M' | '3M' | '6M' | '1Y' | 'ALL' = 'ALL',
  now: Date = new Date(),
): GymExerciseProgressDomain {
  let heaviestWeight: number | null = null;
  let bestVolumeSet: number | null = null;
  let estimated1RM: number | null = null;
  let mostReps: number | null = null;
  let longestDurationSeconds: number | null = null;
  let longestDistanceMeters: number | null = null;
  let lastTrained: Date | null = null;

  const workingSets = completedSets.filter(isWorkingSet);

  for (const s of workingSets) {
    const w = s.weight !== null && s.weight !== undefined ? Number(s.weight) : null;
    const r = s.reps !== null && s.reps !== undefined ? Number(s.reps) : null;
    const d = s.durationSeconds !== null && s.durationSeconds !== undefined ? Number(s.durationSeconds) : null;
    const m = s.distanceMeters !== null && s.distanceMeters !== undefined ? Number(s.distanceMeters) : null;
    const pDate = s.performedAt ? new Date(s.performedAt) : s.completedAt ? new Date(s.completedAt) : null;

    if (pDate && (!lastTrained || pDate > lastTrained)) {
      lastTrained = pDate;
    }

    if (w !== null && (heaviestWeight === null || w > heaviestWeight)) {
      heaviestWeight = w;
    }
    if (r !== null && (mostReps === null || r > mostReps)) {
      mostReps = r;
    }
    if (d !== null && (longestDurationSeconds === null || d > longestDurationSeconds)) {
      longestDurationSeconds = d;
    }
    if (m !== null && (longestDistanceMeters === null || m > longestDistanceMeters)) {
      longestDistanceMeters = m;
    }

    if (w !== null && r !== null) {
      const vol = w * r;
      if (bestVolumeSet === null || vol > bestVolumeSet) {
        bestVolumeSet = vol;
      }
      const e1rm = calculateE1RM(w, r);
      if (e1rm !== null && (estimated1RM === null || e1rm > estimated1RM)) {
        estimated1RM = e1rm;
      }
    }
  }

  // Filter sets for history points by date range
  const filteredSets = filterByDateRange(
    workingSets.map((s) => ({
      ...s,
      startedAt: s.performedAt || s.completedAt,
    })),
    range,
    now,
  );

  // Group by workout/date to form chart points
  const pointsMap = new Map<string, GymProgressPointDomain>();
  for (const s of filteredSets) {
    const date = s.performedAt ? new Date(s.performedAt) : s.completedAt ? new Date(s.completedAt) : new Date();
    const workoutId = s.workoutId || s.id;
    const key = `${workoutId}-${date.toISOString().slice(0, 10)}`;

    const w = s.weight !== null && s.weight !== undefined ? Number(s.weight) : null;
    const r = s.reps !== null && s.reps !== undefined ? Number(s.reps) : null;
    const d = s.durationSeconds !== null && s.durationSeconds !== undefined ? Number(s.durationSeconds) : null;
    const m = s.distanceMeters !== null && s.distanceMeters !== undefined ? Number(s.distanceMeters) : null;
    const e1rm = calculateE1RM(w, r);
    const vol = w !== null && r !== null ? w * r : null;

    const existing = pointsMap.get(key);
    if (!existing) {
      pointsMap.set(key, {
        date,
        workoutId,
        weight: w,
        reps: r,
        estimated1RM: e1rm,
        volume: vol,
        durationSeconds: d,
        distanceMeters: m,
      });
    } else {
      if (w !== null && (existing.weight === null || w > existing.weight)) existing.weight = w;
      if (r !== null && (existing.reps === null || r > existing.reps)) existing.reps = r;
      if (e1rm !== null && (existing.estimated1RM === null || e1rm > existing.estimated1RM)) existing.estimated1RM = e1rm;
      if (vol !== null) existing.volume = (existing.volume || 0) + vol;
      if (d !== null) existing.durationSeconds = (existing.durationSeconds || 0) + d;
      if (m !== null) existing.distanceMeters = (existing.distanceMeters || 0) + m;
    }
  }

  const historyPoints = Array.from(pointsMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return {
    exercise,
    records: {
      heaviestWeight,
      estimated1RM,
      bestSetVolume: bestVolumeSet,
      mostReps,
      longestDurationSeconds,
      longestDistanceMeters,
      totalCompletedSets: workingSets.length,
      lastTrained,
    },
    historyPoints,
    recentSets: workingSets.slice(0, 15),
  };
}
