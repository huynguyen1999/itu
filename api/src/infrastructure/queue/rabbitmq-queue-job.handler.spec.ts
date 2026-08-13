import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';
import { QUEUE_CONSTANTS } from '@core/application/constants/app.constants';
import type { ILogger } from '@core/application/ports/out/services.port';
import { RabbitMqQueueJobHandler } from './rabbitmq-queue-job.handler';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('RabbitMqQueueJobHandler', () => {
  const connectMock = connect as jest.MockedFunction<typeof connect>;
  let channel: {
    ack: jest.Mock;
    assertExchange: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
    publish: jest.Mock;
    waitForConfirms: jest.Mock;
  };
  let connection: {
    close: jest.Mock;
    createConfirmChannel: jest.Mock;
    on: jest.Mock;
  };
  let handler: RabbitMqQueueJobHandler;

  beforeEach(() => {
    channel = {
      ack: jest.fn(),
      assertExchange: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      publish: jest.fn().mockReturnValue(true),
      waitForConfirms: jest.fn().mockResolvedValue(undefined),
    };
    connection = {
      close: jest.fn().mockResolvedValue(undefined),
      createConfirmChannel: jest.fn().mockResolvedValue(channel),
      on: jest.fn(),
    };
    connectMock.mockResolvedValue(connection as never);
    const config = new ConfigService({
      RABBITMQ_EXCHANGE: 'itu.ai',
      RABBITMQ_URL: 'amqp://root:root@homelab.tailscale:5672',
    });
    const logger: ILogger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    handler = new RabbitMqQueueJobHandler(config, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('publishes card suggestion jobs with confirm-channel reliability', async () => {
    await handler.enqueueCardSuggestions('job-1');

    expect(connectMock).toHaveBeenCalledWith('amqp://root:root@homelab.tailscale:5672');
    expect(channel.assertExchange).toHaveBeenCalledWith('itu.ai', QUEUE_CONSTANTS.exchangeType, { durable: true });
    expect(channel.publish).toHaveBeenCalledWith(
      'itu.ai',
      QUEUE_CONSTANTS.routingKeys.cardSuggestions,
      Buffer.from(JSON.stringify({ pattern: 'card-suggestions', data: { type: 'card-suggestions', jobId: 'job-1' } })),
      expect.objectContaining({
        contentType: 'application/json',
        messageId: 'job-1',
        persistent: true,
        type: 'card-suggestions',
      }),
    );
    expect(channel.waitForConfirms).toHaveBeenCalledTimes(1);
  });

  it('publishes session feedback jobs with the session-feedback routing key', async () => {
    await handler.enqueueSessionFeedback('job-2');

    expect(channel.publish).toHaveBeenCalledWith(
      'itu.ai',
      QUEUE_CONSTANTS.routingKeys.sessionFeedback,
      Buffer.from(JSON.stringify({ pattern: 'session-feedback', data: { type: 'session-feedback', jobId: 'job-2' } })),
      expect.objectContaining({
        contentType: 'application/json',
        messageId: 'job-2',
        persistent: true,
        type: 'session-feedback',
      }),
    );
  });

  it('publishes scheduled jobs with the scheduled-job routing key', async () => {
    await handler.enqueueScheduledJob('job-3');

    expect(channel.publish).toHaveBeenCalledWith(
      'itu.ai',
      QUEUE_CONSTANTS.routingKeys.scheduledJob,
      Buffer.from(JSON.stringify({ pattern: 'scheduled-job', data: { type: 'scheduled-job', jobId: 'job-3' } })),
      expect.objectContaining({ type: 'scheduled-job' }),
    );
  });

  it('publishes sync invalidation jobs with a generated ULID jobId', async () => {
    await handler.enqueueSyncInvalidation({
      userId: 'user-1',
      entityType: 'task',
      entityId: 'task-1',
      operation: 'UPSERT',
      data: { title: 'Updated' },
      originDeviceId: 'device-1',
      originClientInstanceId: 'instance-1',
    });

    expect(channel.publish).toHaveBeenCalledWith(
      'itu.ai',
      QUEUE_CONSTANTS.routingKeys.syncInvalidation,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: 'application/json',
        persistent: true,
        type: 'sync-invalidation',
      }),
    );
    expect(channel.waitForConfirms).toHaveBeenCalledTimes(1);
  });
});
