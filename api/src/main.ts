import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { CONFIG_KEYS, DEFAULT_URLS, MEDIA_CONSTANTS, QUEUE_CONSTANTS } from '@core/application/constants/app.constants';
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
    const compressionEncodings = supportedCompressionEncodings();
    await app.register(fastifyCompress, {
      encodings: compressionEncodings,
      requestEncodings: compressionEncodings,
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
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (_request, reply, done) => {
        reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        reply.header('Referrer-Policy', 'no-referrer');
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('Cross-Origin-Resource-Policy', 'same-site');
        if (process.env.NODE_ENV === 'production') {
          reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        done();
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

function supportedCompressionEncodings(): Array<'zstd' | 'br' | 'gzip' | 'deflate' | 'identity'> {
  return supportsZstd() ? ['zstd', 'br', 'gzip', 'deflate', 'identity'] : ['br', 'gzip', 'deflate', 'identity'];
}

function supportsZstd(): boolean {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  return major > 23 || (major === 23 && minor >= 8) || (major === 22 && minor >= 15);
}
