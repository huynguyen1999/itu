import { Injectable } from '@nestjs/common';
import {
  IOAuthHandoffRepository,
  IRateLimitRepository,
  IRefreshSessionRepository,
} from '@core/application/ports/out/repositories.port';
import type { CreateRefreshSessionData, RefreshSessionRecord } from '@core/application/ports/out/repository-types.port';
import type { OAuthHandoffPayload } from '@core/application/ports/out/repository-types.port';
import { AUTH_CONSTANTS } from '@core/application/constants/app.constants';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaRefreshSessionRepository implements IRefreshSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRefreshSessionData): Promise<void> {
    await this.prisma.refreshSession.create({ data });
  }

  async findByHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    return this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        rotationGraceUntil: true,
        rotationRecoveryUsedAt: true,
      },
    });
  }

  async rotate(sessionId: string, next: CreateRefreshSessionData): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const result = await tx.refreshSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: {
          revokedAt: now,
          // Covers a client losing the successful refresh response after rotation commits.
          rotationGraceUntil: new Date(now.getTime() + AUTH_CONSTANTS.refreshRotationGraceMs),
        },
      });
      if (result.count !== 1) return false;
      await tx.refreshSession.create({ data: next });
      return true;
    });
  }

  async recoverRotation(sessionId: string, next: CreateRefreshSessionData): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const result = await tx.refreshSession.updateMany({
        where: {
          id: sessionId,
          revokedAt: { not: null },
          rotationGraceUntil: { gt: now },
          rotationRecoveryUsedAt: null,
        },
        data: { rotationRecoveryUsedAt: now },
      });
      if (result.count !== 1) return false;
      await tx.refreshSession.create({ data: next });
      return true;
    });
  }

  async revokeById(sessionId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        rotationGraceUntil: null,
        rotationRecoveryUsedAt: new Date(),
      },
    });
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId },
      data: {
        revokedAt: new Date(),
        rotationGraceUntil: null,
        rotationRecoveryUsedAt: new Date(),
      },
    });
  }
}

@Injectable()
export class PrismaOAuthHandoffRepository implements IOAuthHandoffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    id: string;
    codeHash: string;
    userId?: string | null;
    payload: object;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.oAuthHandoff.create({ data });
  }

  async consume(codeHash: string, now = new Date()) {
    const handoff = await this.prisma.oAuthHandoff.findFirst({
      where: { codeHash, consumedAt: null, expiresAt: { gt: now } },
    });
    if (!handoff) return null;

    await this.prisma.oAuthHandoff.update({
      where: { id: handoff.id },
      data: { consumedAt: now },
    });

    return {
      payload: handoff.payload as unknown as OAuthHandoffPayload,
    };
  }
}

@Injectable()
export class PrismaRateLimitRepository implements IRateLimitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async consume(key: string, windowMs: number, maxRequests: number, now = new Date()) {
    const resetAt = new Date(now.getTime() + windowMs);
    const result = await this.prisma.$transaction(async (tx) => {
      const bucket = await tx.rateLimitBucket.findUnique({ where: { key } });
      if (!bucket || bucket.resetAt <= now) {
        const next = await tx.rateLimitBucket.upsert({
          where: { key },
          create: { key, count: 1, resetAt },
          update: { count: 1, resetAt },
        });
        return { allowed: true, resetAt: next.resetAt };
      }

      if (bucket.count >= maxRequests) {
        return { allowed: false, resetAt: bucket.resetAt };
      }

      const next = await tx.rateLimitBucket.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
      return { allowed: true, resetAt: next.resetAt };
    });
    return result;
  }
}
