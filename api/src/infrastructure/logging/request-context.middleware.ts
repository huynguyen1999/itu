import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, NestMiddleware } from '@nestjs/common';
import {
  headerValue,
  requestBodyLogValue,
  requestOrigin,
  resolveRequestUrl,
  responseBodyLogMeta,
  sanitizeHeaderUrl,
  sanitizeHttpUrl,
  shouldLogHttpBodies,
} from './http-log-sanitizer';
import { RequestContextService } from './request-context.service';
import { takeCapturedResponseBody } from './response-body-capture';
import { WinstonLoggerService } from './winston-logger.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: WinstonLoggerService,
  ) {}

  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const requestId = this.resolveRequestId(req.headers['x-request-id']);
    res.setHeader('x-request-id', requestId);

    this.requestContext.run({ requestId }, () => {
      const startedAt = process.hrtime.bigint();
      const method = req.method ?? 'UNKNOWN';
      const url = sanitizeHttpUrl(resolveRequestUrl(req));
      const shouldIncludeBodies = shouldLogHttpBodies();

      this.logger.debug('HTTP request started', {
        requestId,
        method,
        url,
        ip: this.resolveIp(req),
        userAgent: headerValue(req.headers['user-agent']),
        origin: requestOrigin(req.headers),
        referer: sanitizeHeaderUrl(req.headers.referer),
        ...(shouldIncludeBodies ? { requestBody: requestBodyLogValue(req) } : {}),
      });

      let logged = false;
      const logResponse = (event: 'finish' | 'close') => {
        if (logged) return;
        logged = true;

        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const statusCode = res.statusCode;
        const meta = {
          requestId,
          method,
          url,
          statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          contentLength: headerValue(res.getHeader('content-length')),
          event,
          ...(shouldIncludeBodies
            ? responseBodyLogMeta(takeCapturedResponseBody(req), res.getHeader('content-type'))
            : {}),
        };

        if (statusCode >= 500) {
          this.logger.error('HTTP request completed', meta);
          return;
        }
        if (statusCode >= 400 || event === 'close') {
          this.logger.warn('HTTP request completed', meta);
          return;
        }
        this.logger.debug('HTTP request completed', meta);
      };

      res.once('finish', () => logResponse('finish'));
      res.once('close', () => logResponse('close'));

      next();
    });
  }

  private resolveRequestId(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0]?.trim() || randomUUID();
    return value?.trim() || randomUUID();
  }

  private resolveIp(req: IncomingMessage): string | undefined {
    return headerValue(req.headers['x-forwarded-for']) ?? req.socket.remoteAddress;
  }
}
