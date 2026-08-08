import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { CONFIG_KEYS, MEDIA_CONSTANTS, QUEUE_CONSTANTS } from '@core/application/constants/app.constants';
import { AppModule } from './app.module';
import { WinstonLoggerService } from './infrastructure/logging/winston-logger.service';
import { captureResponseBody } from './infrastructure/logging/response-body-capture';
import { shouldLogHttpBodies } from './infrastructure/logging/http-log-sanitizer';
import { corsOrigin } from './infrastructure/transport/rest/cors-origin';
import { configureOutboundHttp } from './infrastructure/http/outbound-http';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  const logger = app.get(WinstonLoggerService);
  app.useLogger(logger);
  configureOutboundHttp();

  try {
    await app.register(fastifyCompress, {
      threshold: 1024,
    });
    await app.register(fastifyCookie);
    await app.register(fastifyMultipart, {
      limits: {
        fileSize: MEDIA_CONSTANTS.maxImageBytes,
        files: MEDIA_CONSTANTS.maxUploadFiles,
      },
    });

    app
      .getHttpAdapter()
      .getInstance()
      .addHook('preSerialization', (request, _reply, payload, done) => {
        if (shouldLogHttpBodies()) captureResponseBody(request.raw, payload);
        done(null, payload);
      });
    app.enableCors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86400, // Cache preflight OPTIONS requests for 1 day (in seconds)
    });

    await app.register(fastifyHelmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    });

    const rabbitMqUrl = process.env[CONFIG_KEYS.rabbitMqUrl];
    if (rabbitMqUrl) {
      // Connect RabbitMQ as a hybrid microservice so that @MessagePattern
      // decorators in RabbitMqMessageController can consume queue jobs.
      // Uses a topic exchange with wildcard binding (#) so all routing keys
      // published by RabbitMqQueueJobHandler reach the single consumer queue.
      app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.RMQ,
        options: {
          urls: [rabbitMqUrl],
          queue: 'itu.jobs',
          queueOptions: { durable: true },
          exchange: process.env[CONFIG_KEYS.rabbitMqExchange] ?? QUEUE_CONSTANTS.defaultRabbitMqExchange,
          exchangeType: QUEUE_CONSTANTS.exchangeType,
          routingKey: '#',
          noAck: false,
          prefetchCount: 1,
          persistent: true,
          socketOptions: { heartbeatInterval: 30 },
        },
      });
      await app.startAllMicroservices();
      logger.debug('RabbitMQ hybrid microservice connected');
    } else {
      logger.warn('RABBITMQ_URL not set — RabbitMQ microservice not started');
    }

    await app.listen({
      port: process.env[CONFIG_KEYS.port] ? Number(process.env[CONFIG_KEYS.port]) : 3000,
      host: '0.0.0.0',
    });
  } catch (error) {
    logger.error('API bootstrap failed', error instanceof Error ? error.stack : { error });
    throw error;
  }
}

void bootstrap();

