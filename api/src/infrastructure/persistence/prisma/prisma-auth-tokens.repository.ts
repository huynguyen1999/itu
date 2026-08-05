import { Injectable } from '@nestjs/common';
import {
  IOAuthHandoffRepository,
  IRateLimitRepository,
  IRefreshSessionRepository,
} from '@core/application/ports/out/repositories.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaRefreshSessionRepository implements IRefreshSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { id: string; userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.prisma.refreshSession.create({ data });
  }

  async findActiveByHash(tokenHash: string, now = new Date()): Promise<{ id: string; userId: string } | null> {
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { deletedAt: null, deletionRequestedAt: null },
      },
      select: { id: true, userId: true },
    });
    return session;
  }

  async rotate(
    sessionId: string,
    next: { id: string; userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshSession.create({ data: next }),
    ]);
  }

  async revokeById(sessionId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
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
      payload: handoff.payload as {
        type: 'success' | 'register';
        accessToken?: string;
        refreshToken?: string;
        registerToken?: string;
      },
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
