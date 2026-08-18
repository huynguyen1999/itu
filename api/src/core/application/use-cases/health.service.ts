import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { HEALTH_KIT_SOURCE, HealthSummaryWrite, HealthWorkoutWrite } from './health.types';

type HealthPayload = Record<string, unknown>;

export class HealthKitSyncService {
  parseSummary(payload: HealthPayload): HealthSummaryWrite {
    this.validateSource(payload);
    const sleepStart = this.optionalInstant(payload, 'sleepStart');
    const sleepEnd = this.optionalInstant(payload, 'sleepEnd');
    if ((sleepStart === null) !== (sleepEnd === null)) {
      throw new InvalidSyncMutationException('sleepStart and sleepEnd must be provided together');
    }
    if (sleepStart && sleepEnd && sleepStart > sleepEnd) {
      throw new InvalidSyncMutationException('sleepStart must not be after sleepEnd');
    }
    return {
      source: HEALTH_KIT_SOURCE,
      localDate: this.localDate(payload.localDate),
      steps: this.requiredInteger(payload, 'steps'),
      walkingRunningDistanceMeters: this.requiredNumber(payload, 'walkingRunningDistanceMeters'),
      activeEnergyKcal: this.requiredNumber(payload, 'activeEnergyKcal'),
      exerciseMinutes: this.requiredInteger(payload, 'exerciseMinutes'),
      standHours: this.optionalNumber(payload, 'standHours'),
      sleepMinutes: this.optionalInteger(payload, 'sleepMinutes'),
      sleepStart,
      sleepEnd,
      restingHeartRateBpm: this.optionalNumber(payload, 'restingHeartRateBpm'),
      hrvMilliseconds: this.optionalNumber(payload, 'hrvMilliseconds'),
      workoutCount: this.requiredInteger(payload, 'workoutCount'),
      workoutMinutes: this.requiredInteger(payload, 'workoutMinutes'),
      workoutEnergyKcal: this.requiredNumber(payload, 'workoutEnergyKcal'),
    };
  }

  parseWorkout(payload: HealthPayload): HealthWorkoutWrite {
    this.validateSource(payload);
    const startedAt = this.requiredInstant(payload, 'startedAt');
    const endedAt = this.requiredInstant(payload, 'endedAt');
    if (startedAt > endedAt) throw new InvalidSyncMutationException('startedAt must not be after endedAt');
    return {
      source: HEALTH_KIT_SOURCE,
      healthKitUUID: this.requiredString(payload, 'healthKitUUID', 255),
      activityType: this.requiredString(payload, 'activityType', 100),
      startedAt,
      endedAt,
      durationSeconds: this.requiredInteger(payload, 'durationSeconds'),
      energyKcal: this.optionalNumber(payload, 'energyKcal'),
      sourceBundleId: this.optionalString(payload, 'sourceBundleId', 255),
      deviceName: this.optionalString(payload, 'deviceName', 255),
    };
  }

  assertSource(payload: HealthPayload): void {
    this.validateSource(payload);
  }

  workoutUUID(payload: HealthPayload, fallback: string): string {
    const value = payload.healthKitUUID;
    if (value === undefined) {
      const canonicalUUID = fallback.includes(':') ? fallback.slice(fallback.indexOf(':') + 1) : fallback;
      return this.boundedString(canonicalUUID, 'healthKitUUID', 255);
    }
    return this.requiredString(payload, 'healthKitUUID', 255);
  }

  localDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private validateSource(payload: HealthPayload): void {
    if (payload.source !== undefined && payload.source !== HEALTH_KIT_SOURCE) {
      throw new InvalidSyncMutationException('source must be HEALTH_KIT');
    }
  }

  private localDate(value: unknown): Date {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new InvalidSyncMutationException('localDate must be a valid YYYY-MM-DD date');
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || this.localDateKey(parsed) !== value) {
      throw new InvalidSyncMutationException('localDate must be a valid YYYY-MM-DD date');
    }
    return parsed;
  }

  private requiredInstant(payload: HealthPayload, key: string): Date {
    const value = payload[key];
    if (typeof value !== 'string') throw new InvalidSyncMutationException(`${key} is required`);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new InvalidSyncMutationException(`${key} must be a valid date`);
    return parsed;
  }

  private optionalInstant(payload: HealthPayload, key: string): Date | null {
    const value = payload[key];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim().length === 0) return null;
    return this.requiredInstant(payload, key);
  }

  private requiredInteger(payload: HealthPayload, key: string): number {
    const value = payload[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new InvalidSyncMutationException(`${key} must be a nonnegative integer`);
    }
    return value;
  }

  private optionalInteger(payload: HealthPayload, key: string): number | null {
    const value = payload[key];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim().length === 0) return null;
    return this.requiredInteger(payload, key);
  }

  private requiredNumber(payload: HealthPayload, key: string): number {
    const value = payload[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new InvalidSyncMutationException(`${key} must be a nonnegative number`);
    }
    return value;
  }

  private optionalNumber(payload: HealthPayload, key: string): number | null {
    const value = payload[key];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim().length === 0) return null;
    return this.requiredNumber(payload, key);
  }

  private requiredString(payload: HealthPayload, key: string, maxLength: number): string {
    return this.boundedString(payload[key], key, maxLength);
  }

  private optionalString(payload: HealthPayload, key: string, maxLength: number): string | null {
    const value = payload[key];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim().length === 0) return null;
    return this.boundedString(value, key, maxLength);
  }

  private boundedString(value: unknown, key: string, maxLength: number): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
      throw new InvalidSyncMutationException(`${key} must be a non-empty string of at most ${maxLength} characters`);
    }
    return value.trim();
  }
}
