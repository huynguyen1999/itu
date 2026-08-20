import { Injectable } from '@nestjs/common';
import {
  FocusSessionStatus,
  CommitmentPolicyLevel,
  GrowthSourceType,
  HabitOccurrenceStatus,
  HabitProgressSource,
  HabitReminderDeliveryStatus,
  HabitScheduleType,
  Prisma,
  ScheduledJobStatus,
  ScheduledJobType,
} from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import { PrismaFocusPersistence } from './prisma-focus.persistence';
import { utcDay } from '@core/application/use-cases/productivity-rules';
import {
  addLocalDays,
  calculateInsights,
  effectiveTarget,
  isHabitDateInRange,
  isHabitScheduled,
  localDateKey,
  localDateTimeToUtc,
  logicalLocalDate,
  parseLocalDate,
  periodBounds,
  projectHabitDays,
  statusForValue,
  type HabitDayState,
} from '@core/application/use-cases/habit-v2';
import { awardGrowthActivityWithReceipt, reverseGrowthActivityWithReceipt, GrowthAwardReceipt } from '@core/application/use-cases/growth-awards';
import { ensureHabitGrowthRule } from '@core/application/use-cases/ensure-habit-growth-rule';
import { HABIT_ACTION_MARKER_PREFIX } from './prisma-sync.helpers';
import { focusActionSemanticPayload, focusAdjustSemanticPayload, focusPayloadsEqual } from './focus-idempotency';
import { commitmentDefaults, commitmentSnapshot, evaluateMissedCommitment, recoveryWindowOpen, reverseCommitmentPenalty } from '@core/application/use-cases/habit-commitments';
import { configuredCommitmentFeatureEnabled } from '@infrastructure/config/commitment-feature.adapter';

import {
  DAY_MS,
  HABIT_GENERATION_LOOKBACK_DAYS,
  HABIT_INCLUDE,
  MAX_HABIT_RANGE_DAYS,
  normalizeLocalDate,
  serializableWithRetry,
  weekStartDayFromPreferences,
} from './prisma-productivity-habit.shared';
import { PrismaProductivityHabitCore } from './prisma-productivity-habit-core';


export class PrismaProductivityHabitFocus extends PrismaProductivityHabitCore {
  private readonly focus: PrismaFocusPersistence;

  constructor(db: PrismaService) {
    super(db);
    this.focus = new PrismaFocusPersistence(db);
  }

  listFocusPresets(userId: string) { return this.focus.listFocusPresets(userId); }
  findFocusPresetById(userId: string, id: string) { return this.focus.findFocusPresetById(userId, id); }
  createFocusPreset(userId: string, data: any) { return this.focus.createFocusPreset(userId, data); }
  updateFocusPreset(userId: string, id: string, data: any) { return this.focus.updateFocusPreset(userId, id, data); }
  deleteFocusPreset(userId: string, id: string) { return this.focus.deleteFocusPreset(userId, id); }
  listFocusSessions(userId: string, filter?: any) { return this.focus.listFocusSessions(userId, filter); }
  findFocusSessionById(userId: string, id: string) { return this.focus.findFocusSessionById(userId, id); }
  findActiveFocusSession(userId: string) { return this.focus.findActiveFocusSession(userId); }
  createFocusSession(userId: string, data: any) { return this.focus.createFocusSession(userId, data); }
  updateFocusSession(userId: string, id: string, data: any) { return this.focus.updateFocusSession(userId, id, data); }

  async focusAction(userId: string, sessionId: string, action: string, input: any = {}) {
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : null;
    const eventPayload = focusActionSemanticPayload(action, input);
    try {
      return await this.db.$transaction(async (tx) => {
      const current = await tx.focusSession.findFirst({ where: { id: sessionId, userId } });
      if (!current) throw new EntityNotFoundException('Focus session', sessionId);
      if (idempotencyKey) {
        const existingEvent = await tx.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId, idempotencyKey } } });
        if (existingEvent) {
          if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
            throw new DomainException('Focus action idempotency key was reused with a different payload');
          }
          return { ...current, growthReceipt: existingEvent.growthReceipt ?? null };
        }
      }
      if (action === 'complete' && current.status === FocusSessionStatus.COMPLETED) return current;
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
        throw new DomainException('Focus session has changed; refresh before retrying');
      }
      const now = new Date();
      const pauseSeconds =
        action === 'resume' && current.pausedAt
          ? Math.max(0, Math.floor((now.getTime() - new Date(current.pausedAt).getTime()) / 1000))
          : 0;

      const updateData = {
          status:
            action === 'pause'
              ? FocusSessionStatus.PAUSED
              : action === 'complete'
                ? FocusSessionStatus.COMPLETED
                : action === 'abandon'
                  ? FocusSessionStatus.ABANDONED
                  : action === 'resume'
                    ? FocusSessionStatus.ACTIVE
                    : undefined,
          pausedAt: action === 'pause' ? now : action === 'resume' ? null : undefined,
          accumulatedPauseSecs: pauseSeconds ? { increment: pauseSeconds } : undefined,
          completedAt: action === 'complete' || action === 'abandon' ? now : undefined,
          plannedSeconds: action === 'extend' ? { increment: input.extendSeconds ?? 300 } : undefined,
          ownerDeviceId: action === 'takeover' ? input.ownerDeviceId : undefined,
          customTitle: action === 'rename' ? input.customTitle : undefined,
          reflection: input.reflection,
          version: { increment: 1 },
      };
      let updated;
      if (input.expectedVersion !== undefined) {
        const result = await tx.focusSession.updateMany({
          where: { id: sessionId, userId, version: input.expectedVersion },
          data: updateData,
        });
        if (!result.count) throw new DomainException('Focus session has changed; refresh before retrying');
        updated = await tx.focusSession.findFirst({ where: { id: sessionId, userId } });
        if (!updated) throw new EntityNotFoundException('Focus session', sessionId);
      } else {
        updated = await tx.focusSession.update({ where: { id: sessionId }, data: updateData });
      }
      const focusEventId = idempotencyKey ? createUlid() : null;
      if (focusEventId) {
        await tx.focusEvent.create({ data: { id: focusEventId, sessionId, idempotencyKey, type: action, payload: eventPayload } });
      }
      const growthReceipt = await this.focus.settleFocusGrowth(tx, userId, current, updated);
      if (focusEventId && tx.focusEvent?.update) {
        await tx.focusEvent.update({ where: { id: focusEventId }, data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } });
      }
      return { ...updated, growthReceipt };
      });
    } catch (error) {
      // Two concurrent requests can both pass the read-before-write check. If
      // the unique event key is won by the other transaction, resolve this as
      // the same idempotent replay after the failed transaction has rolled back.
      const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
      if (idempotencyKey && code === 'P2002') {
        const existingEvent = await this.db.focusEvent.findUnique({
          where: { sessionId_idempotencyKey: { sessionId, idempotencyKey } },
        });
        if (existingEvent) {
          if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
            throw new DomainException('Focus action idempotency key was reused with a different payload');
          }
          const current = await this.db.focusSession.findFirst({ where: { id: sessionId, userId } });
          if (current) return { ...current, growthReceipt: existingEvent.growthReceipt ?? null };
        }
      }
      throw error;
    }
  }

  async adjustFocus(
    userId: string,
    id: string,
    startedAt?: string,
    completedAt?: string,
    taskId?: string,
    expectedVersion?: number,
    idempotencyKey?: string,
  ) {
    const eventPayload = focusAdjustSemanticPayload(startedAt, completedAt, taskId);
    try {
      return await this.db.$transaction(async (tx) => {
        const session = await tx.focusSession.findFirst({ where: { id, userId } });
        if (!session) throw new EntityNotFoundException('Focus session', id);
        if (idempotencyKey && tx.focusEvent?.findUnique) {
          const existingEvent = await tx.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId: id, idempotencyKey } } });
          if (existingEvent) {
            if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
              throw new DomainException('Focus adjustment idempotency key was reused with a different payload');
            }
            return { ...session, growthReceipt: existingEvent.growthReceipt ?? null };
          }
        }
        if (expectedVersion !== undefined && expectedVersion !== session.version) {
          throw new DomainException('Focus session has changed; refresh before retrying');
        }
        const updateData = {
            adjustedStartedAt: startedAt ? new Date(startedAt) : undefined,
            adjustedCompletedAt: completedAt ? new Date(completedAt) : undefined,
            adjustedAt: startedAt || completedAt ? new Date() : undefined,
            taskId: taskId !== undefined ? taskId : undefined,
            version: { increment: 1 },
        };
        let updated;
        if (expectedVersion !== undefined) {
          const result = await tx.focusSession.updateMany({ where: { id, userId, version: expectedVersion }, data: updateData });
          if (!result.count) throw new DomainException('Focus session has changed; refresh before retrying');
          updated = await tx.focusSession.findFirst({ where: { id, userId } });
          if (!updated) throw new EntityNotFoundException('Focus session', id);
        } else {
          updated = await tx.focusSession.update({ where: { id }, data: updateData });
        }
        const focusEventId = idempotencyKey ? createUlid() : null;
        if (focusEventId && tx.focusEvent?.create) {
          await tx.focusEvent.create({ data: { id: focusEventId, sessionId: id, idempotencyKey: idempotencyKey!, type: 'adjust', payload: eventPayload } });
        }
        const growthReceipt = await this.focus.settleFocusGrowth(tx, userId, session, updated);
        if (focusEventId && tx.focusEvent?.update) {
          await tx.focusEvent.update({ where: { id: focusEventId }, data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } });
        }
        return { ...updated, growthReceipt };
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
      if (idempotencyKey && code === 'P2002' && this.db.focusEvent?.findUnique) {
        const existingEvent = await this.db.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId: id, idempotencyKey } } });
        if (existingEvent) {
          if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
            throw new DomainException('Focus adjustment idempotency key was reused with a different payload');
          }
          const current = await this.db.focusSession.findFirst({ where: { id, userId } });
          if (current) return { ...current, growthReceipt: existingEvent.growthReceipt ?? null };
        }
      }
      throw error;
    }
  }

  // ─── Habit Check-in & Actions ──────────────────────────────────────────────


}
