import {
  FocusSessionStatus,
  FocusPhase,
  GrowthSourceType,
  Prisma,
} from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import {
  awardGrowthActivityWithReceipt,
  reverseGrowthActivity,
  GrowthAwardReceipt,
} from '@core/application/use-cases/growth-awards';
import {
  focusPayloadsEqual,
  focusStartSemanticPayload,
} from './focus-idempotency';

function sameFocusStartPayload(session: any, data: any): boolean {
  const expected = focusStartSemanticPayload(data);
  return (
    (session.taskId ?? null) === expected.taskId &&
    (session.mode ?? null) === expected.mode &&
    (session.phase ?? FocusPhase.WORK) === expected.phase &&
    (session.presetId ?? null) === expected.presetId &&
    (session.policyId ?? null) === expected.policyId &&
    (session.ownerDeviceId ?? null) === expected.ownerDeviceId &&
    (session.plannedSeconds ?? null) === expected.plannedSeconds
  );
}

function validFocusMinutes(
  session: Pick<Prisma.FocusSessionGetPayload<{}>, 'startedAt' | 'completedAt' | 'adjustedStartedAt' | 'adjustedCompletedAt' | 'accumulatedPauseSecs'>,
): number {
  const effectiveStartedAt = session.adjustedStartedAt ?? session.startedAt;
  const effectiveCompletedAt = session.adjustedCompletedAt ?? session.completedAt;
  if (!effectiveCompletedAt) return 0;
  const elapsedSeconds = Math.floor((effectiveCompletedAt.getTime() - effectiveStartedAt.getTime()) / 1000);
  return Math.max(0, Math.floor((elapsedSeconds - Math.max(0, session.accumulatedPauseSecs ?? 0)) / 60));
}

export class PrismaFocusPersistence {
  constructor(private readonly db: PrismaService) {}

  async listFocusPresets(userId: string) {
    return this.db.focusPreset.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }] });
  }

  async findFocusPresetById(userId: string, id: string) {
    return this.db.focusPreset.findFirst({ where: { id, userId } });
  }

  async createFocusPreset(userId: string, data: any) {
    return this.db.focusPreset.create({ data: { id: createUlid(), userId, ...data } });
  }

  async updateFocusPreset(userId: string, id: string, data: any) {
    return this.db.focusPreset.update({ where: { id }, data });
  }

  async deleteFocusPreset(userId: string, id: string) {
    const deleted = await this.db.focusPreset.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async listFocusSessions(userId: string, filter?: any) {
    const where: Prisma.FocusSessionWhereInput = { userId };
    if (filter?.from || filter?.to) {
      where.startedAt = {};
      if (filter.from) (where.startedAt as any).gte = new Date(filter.from);
      if (filter.to) (where.startedAt as any).lte = new Date(filter.to);
    }
    const take = filter?.limit ? Math.min(filter.limit, 50) : 50;
    return this.db.focusSession.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      take,
      ...(filter?.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });
  }

  async findFocusSessionById(userId: string, id: string) {
    return this.db.focusSession.findFirst({ where: { id, userId } });
  }

  async findActiveFocusSession(userId: string) {
    return this.db.focusSession.findFirst({
      where: { userId, status: { in: [FocusSessionStatus.ACTIVE, FocusSessionStatus.PAUSED] } },
      include: { task: true, preset: true, interruptions: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async createFocusSession(userId: string, data: any) {
    const idempotencyKey = typeof data.idempotencyKey === 'string' ? data.idempotencyKey : null;
    const payload = focusStartSemanticPayload(data);
    if (idempotencyKey && this.db.focusSession?.findUnique) {
      const existingSession = await this.db.focusSession.findUnique({ where: { userId_startIdempotencyKey: { userId, startIdempotencyKey: idempotencyKey } } });
      if (existingSession) {
        if (!sameFocusStartPayload(existingSession, data)) throw new DomainException('Focus start idempotency key was reused with a different payload');
        return existingSession;
      }
    }
    if (idempotencyKey && this.db.focusEvent?.findFirst) {
      const existingEvent = await this.db.focusEvent.findFirst({
        where: { idempotencyKey, type: 'start', session: { userId } },
        include: { session: true },
      });
      if (existingEvent) {
        if (!focusPayloadsEqual(existingEvent.payload, payload)) throw new DomainException('Focus start idempotency key was reused with a different payload');
        return existingEvent.session;
      }
    }
    const active = await this.db.focusSession.findFirst({ where: { userId, status: { in: [FocusSessionStatus.ACTIVE, FocusSessionStatus.PAUSED] } } });
    if (active) throw new DomainException('An active focus session is already in progress');
    try {
      const { idempotencyKey: _idempotencyKey, ...sessionData } = data;
      const session = await this.db.focusSession.create({ data: { id: createUlid(), userId, ...sessionData, startIdempotencyKey: idempotencyKey } });
      if (idempotencyKey && this.db.focusEvent?.create) {
        await this.db.focusEvent.create({ data: { id: createUlid(), sessionId: session.id, idempotencyKey, type: 'start', payload } });
      }
      return session;
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
      if (idempotencyKey && code === 'P2002') {
        if (this.db.focusSession?.findUnique) {
          const existingSession = await this.db.focusSession.findUnique({ where: { userId_startIdempotencyKey: { userId, startIdempotencyKey: idempotencyKey } } });
          if (existingSession) {
            if (!sameFocusStartPayload(existingSession, data)) throw new DomainException('Focus start idempotency key was reused with a different payload');
            return existingSession;
          }
        }
        const existingEvent = this.db.focusEvent?.findFirst
          ? await this.db.focusEvent.findFirst({ where: { idempotencyKey, type: 'start', session: { userId } }, include: { session: true } })
          : null;
        if (existingEvent) {
          if (!focusPayloadsEqual(existingEvent.payload, payload)) throw new DomainException('Focus start idempotency key was reused with a different payload');
          return existingEvent.session;
        }
      }
      throw error;
    }
  }

  async updateFocusSession(userId: string, id: string, data: any) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.focusSession.findFirst({ where: { id, userId } });
      if (!current) throw new EntityNotFoundException('Focus session', id);
      const updated = await tx.focusSession.update({ where: { id }, data });
      const growthReceipt = await this.settleFocusGrowth(tx, userId, current, updated);
      return { ...updated, growthReceipt };
    });
  }

  async settleFocusGrowth(
    tx: Prisma.TransactionClient,
    userId: string,
    previous: Prisma.FocusSessionGetPayload<{}>,
    updated: Prisma.FocusSessionGetPayload<{}>,
  ): Promise<GrowthAwardReceipt | null> {
    const presetId = updated.presetId ?? previous.presetId;
    if (!presetId) return null;
    const preset = await tx.focusPreset.findFirst({ where: { id: presetId, userId } });
    if (!preset) return null;

    const becameCompleted = previous.status !== FocusSessionStatus.COMPLETED && updated.status === FocusSessionStatus.COMPLETED;
    const becameIncomplete = previous.status === FocusSessionStatus.COMPLETED && updated.status !== FocusSessionStatus.COMPLETED;
    if (becameIncomplete) {
      await reverseGrowthActivity(tx, userId, GrowthSourceType.FOCUS_PRESET, updated.id, preset.name);
      return null;
    }
    const wasCompleted = previous.status === FocusSessionStatus.COMPLETED;
    const isCompleted = updated.status === FocusSessionStatus.COMPLETED;
    const wasEligible = validFocusMinutes(previous) >= 5;
    const isEligible = validFocusMinutes(updated) >= 5;
    if (!becameCompleted && !(wasCompleted && isCompleted && wasEligible !== isEligible)) return null;
    if (wasCompleted && isCompleted && wasEligible && !isEligible) {
      await reverseGrowthActivity(tx, userId, GrowthSourceType.FOCUS_PRESET, updated.id, preset.name);
      return null;
    }

    const durationMinutes = validFocusMinutes(updated);
    if (durationMinutes < 5) return null;
    return awardGrowthActivityWithReceipt(
      tx,
      userId,
      GrowthSourceType.FOCUS_PRESET,
      preset.id,
      preset.name,
      { durationMinutes, focusSessionId: updated.id },
      updated.id,
      { durationMinutes },
    );
  }
}
