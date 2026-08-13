import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { CONFIG_KEYS, QUEUE_CONSTANTS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { ILogger, IQueueJobHandler, SyncQueueJob } from '@core/application/ports/out/services.port';
import { createUlid } from '../persistence/prisma/ulid';
import type { AiQueueJob, ScheduledQueueJob } from './queue.types';

/**
 * RabbitMQ publisher with confirm-channel reliability.
 *
 * Publishing only — consumer responsibility is delegated to
 * {@link RabbitMqMessageController} via NestJS `@MessagePattern` decorators
 * wired through the hybrid microservice in `main.ts`.
 */
@Injectable()
export class RabbitMqQueueJobHandler implements IQueueJobHandler, OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private connecting?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureChannel();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close().catch((error: unknown) => {
      this.logger.warn('RabbitMQ publisher channel close failed', { error: this.errorMessage(error) });
    });
    await this.connection?.close().catch((error: unknown) => {
      this.logger.warn('RabbitMQ publisher connection close failed', { error: this.errorMessage(error) });
    });
  }

  async enqueueCardSuggestions(jobId: string): Promise<void> {
    await this.publish({ type: 'card-suggestions', jobId });
  }

  async enqueueSessionFeedback(jobId: string): Promise<void> {
    await this.publish({ type: 'session-feedback', jobId });
  }

  async enqueueReviewInsights(jobId: string): Promise<void> {
    await this.publish({ type: 'review-insights', jobId });
  }

  async enqueueScheduledJob(jobId: string): Promise<void> {
    await this.publish({ type: 'scheduled-job', jobId });
  }

  async enqueueSyncInvalidation(jobData: Omit<SyncQueueJob, 'type' | 'jobId'>): Promise<void> {
    await this.publish({
      type: 'sync-invalidation',
      jobId: createUlid(),
      ...jobData,
    });
  }

  private async publish(job: AiQueueJob | ScheduledQueueJob | SyncQueueJob): Promise<void> {
    const channel = await this.ensureChannel();
    const routingKey = this.routingKey(job.type);
    const message = Buffer.from(JSON.stringify({ pattern: job.type, data: job }));
    channel.publish(this.exchangeName, routingKey, message, {
      contentType: 'application/json',
      messageId: job.jobId,
      persistent: true,
      timestamp: Date.now(),
      type: job.type,
    });
    await channel.waitForConfirms();
    this.logger.debug('Queue job published to RabbitMQ', { jobId: job.jobId, type: job.type, routingKey });
  }

  private async ensureChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    if (!this.connecting) {
      this.connecting = this.connect();
    }
    await this.connecting;
    if (!this.channel) throw new Error('RabbitMQ publisher channel was not initialized');
    return this.channel;
  }

  private async connect(): Promise<void> {
    try {
      const connection = await connect(this.connectionUrl);
      const channel = await connection.createConfirmChannel();
      channel.on('close', () => {
        this.channel = undefined;
        this.logger.warn('RabbitMQ publisher channel closed');
      });
      channel.on('error', (error: Error) => {
        this.logger.error('RabbitMQ publisher channel error', { error: error.message });
      });
      connection.on('close', () => {
        this.connection = undefined;
        this.logger.warn('RabbitMQ publisher connection closed');
      });
      connection.on('error', (error: Error) => {
        this.logger.error('RabbitMQ publisher connection error', { error: error.message });
      });

      await channel.assertExchange(this.exchangeName, QUEUE_CONSTANTS.exchangeType, { durable: true });

      this.connection = connection;
      this.channel = channel;
      this.logger.debug('RabbitMQ publisher connected', { exchange: this.exchangeName });
    } finally {
      this.connecting = undefined;
    }
  }

  private routingKey(type: string): string {
    if (type === 'card-suggestions') return QUEUE_CONSTANTS.routingKeys.cardSuggestions;
    if (type === 'session-feedback') return QUEUE_CONSTANTS.routingKeys.sessionFeedback;
    if (type === 'review-insights') return QUEUE_CONSTANTS.routingKeys.reviewInsights;
    if (type === 'scheduled-job') return QUEUE_CONSTANTS.routingKeys.scheduledJob;
    if (type === 'sync-invalidation') return QUEUE_CONSTANTS.routingKeys.syncInvalidation;
    return type;
  }

  private get connectionUrl(): string {
    return this.requiredConfig(CONFIG_KEYS.rabbitMqUrl);
  }

  private get exchangeName(): string {
    return this.config.get<string>(CONFIG_KEYS.rabbitMqExchange, QUEUE_CONSTANTS.defaultRabbitMqExchange);
  }

  private requiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} is required for RabbitMQ publisher`);
    return value;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
