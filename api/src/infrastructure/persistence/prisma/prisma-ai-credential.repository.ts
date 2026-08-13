import { Injectable } from '@nestjs/common';
import { AiCredentialStatus as PrismaAiCredentialStatus } from '@prisma/client';
import { AiCredentialStatus } from '@core/domain/enums';
import type {
  AiCredentialRecord,
  CreateAiCredentialData,
  IAiCredentialRepository,
  UpdateAiCredentialData,
} from '@core/application/ports/out/ai-credential-repository.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaAiCredentialRepository implements IAiCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AiCredentialRecord[]> {
    const credentials = await this.prisma.aiCredential.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }],
    });
    return credentials.map(mapAiCredential);
  }

  async listEligible(userId: string, now: Date): Promise<AiCredentialRecord[]> {
    const credentials = await this.list(userId);
    return credentials
      .filter(
        (credential) =>
          credential.enabled &&
          (credential.status === AiCredentialStatus.HEALTHY ||
            (credential.status === AiCredentialStatus.RATE_LIMITED &&
              credential.cooldownUntil !== null &&
              credential.cooldownUntil <= now)),
      )
      .sort((left, right) => {
        const leftTime = left.lastUsedAt?.getTime() ?? 0;
        const rightTime = right.lastUsedAt?.getTime() ?? 0;
        return leftTime - rightTime || left.createdAt.getTime() - right.createdAt.getTime();
      });
  }

  count(userId: string): Promise<number> {
    return this.prisma.aiCredential.count({ where: { userId } });
  }

  async findById(userId: string, id: string): Promise<AiCredentialRecord | null> {
    const credential = await this.prisma.aiCredential.findFirst({ where: { userId, id } });
    return credential ? mapAiCredential(credential) : null;
  }

  async create(data: CreateAiCredentialData): Promise<AiCredentialRecord> {
    const credential = await this.prisma.aiCredential.create({ data });
    return mapAiCredential(credential);
  }

  async update(userId: string, id: string, data: UpdateAiCredentialData): Promise<AiCredentialRecord | null> {
    const existing = await this.prisma.aiCredential.findFirst({ where: { userId, id } });
    if (!existing) return null;
    const credential = await this.prisma.aiCredential.update({ where: { id }, data });
    return mapAiCredential(credential);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.aiCredential.deleteMany({ where: { userId, id } });
    return result.count > 0;
  }
}

function mapAiCredential(credential: {
  id: string;
  userId: string;
  encryptedApiKey: string;
  keyHint: string;
  enabled: boolean;
  status: PrismaAiCredentialStatus;
  lastError: string | null;
  lastUsedAt: Date | null;
  cooldownUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AiCredentialRecord {
  return {
    ...credential,
    status: credential.status as AiCredentialStatus,
  };
}
