export const HEALTH_KIT_SOURCE = 'HEALTH_KIT' as const;

export interface HealthSummaryWrite {
  source: typeof HEALTH_KIT_SOURCE;
  localDate: Date;
  steps: number;
  walkingRunningDistanceMeters: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standHours: number | null;
  sleepMinutes: number | null;
  sleepStart: Date | null;
  sleepEnd: Date | null;
  restingHeartRateBpm: number | null;
  hrvMilliseconds: number | null;
  workoutCount: number;
  workoutMinutes: number;
  workoutEnergyKcal: number;
}

export interface HealthWorkoutWrite {
  source: typeof HEALTH_KIT_SOURCE;
  healthKitUUID: string;
  activityType: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  energyKcal: number | null;
  sourceBundleId: string | null;
  deviceName: string | null;
}

export interface HealthSummarySyncData extends Omit<HealthSummaryWrite, 'localDate' | 'sleepStart' | 'sleepEnd'> {
  syncDeviceId: string;
  localDate: string;
  sleepStart: string | null;
  sleepEnd: string | null;
}

export interface HealthWorkoutSyncData extends Omit<HealthWorkoutWrite, 'startedAt' | 'endedAt'> {
  syncDeviceId: string;
  startedAt: string;
  endedAt: string;
}
