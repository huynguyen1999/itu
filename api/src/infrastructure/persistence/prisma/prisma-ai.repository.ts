import { Injectable } from '@nestjs/common';
import { AiJobStatus, AiJobType } from '@core/domain/enums';
import { IAiFeedbackRepository, IAiJobRepository } from '@core/application/ports/out/repositories.port';
import type { CreateAiFeedbackData } from '@core/application/ports/out/repository-types.port';
import { PrismaService } from './prisma.service';
import { mapAiFeedback, mapAiJob } from './prisma.mappers';
import { createUlid } from './ulid';

@Injectable()
export class PrismaAiJobRepository implements IAiJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, type: AiJobType, input: unknown) {
    const job = await this.prisma.aiJob.create({ data: { id: createUlid(), userId, type, input: input as object } });
    return mapAiJob(job);
  }

  async findById(userId: string, jobId: string) {
    const job = await this.prisma.aiJob.findFirst({ where: { userId, id: jobId } });
    return job ? mapAiJob(job) : null;
  }

  async findByIdAnyUser(jobId: string) {
    const job = await this.prisma.aiJob.findUnique({ where: { id: jobId } });
    return job ? mapAiJob(job) : null;
  }

  async markRunning(jobId: string) {
    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: { status: AiJobStatus.RUNNING, attempts: { increment: 1 } },
    });
  }

  async markCompleted(jobId: string, output: unknown) {
    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: { status: AiJobStatus.COMPLETED, output: output as object, completedAt: new Date() },
    });
  }

  async markFailed(jobId: string, error: string) {
    await this.prisma.aiJob.update({ where: { id: jobId }, data: { status: AiJobStatus.FAILED, error } });
  }
}

@Injectable()
export class PrismaAiFeedbackRepository implements IAiFeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySession(userId: string, sessionId: string) {
    const feedback = await this.prisma.aiSessionFeedback.findFirst({ where: { userId, sessionId } });
    return feedback ? mapAiFeedback(feedback) : null;
  }

  async create(userId: string, sessionId: string, data: CreateAiFeedbackData) {
    const feedback = await this.prisma.aiSessionFeedback.upsert({
      where: { sessionId },
      create: { ...data, id: createUlid(), userId, sessionId },
      update: { ...data },
    });
    return mapAiFeedback(feedback);
  }
}
