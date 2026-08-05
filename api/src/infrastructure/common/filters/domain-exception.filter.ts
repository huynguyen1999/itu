import { ArgumentsHost, Catch, ExceptionFilter, Inject } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { TOKENS } from '@core/application/constants/tokens';
import { DomainException } from '@core/domain/exceptions';
import type { ILogger } from '@core/application/ports/out/services.port';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(@Inject(TOKENS.LOGGER) private readonly logger: ILogger) {}

  catch(exception: DomainException, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();

    this.logger.error('Domain exception', {
      code: exception.code,
      message: exception.message,
      status: exception.status,
      path: request.url,
      method: request.method,
    });

    response.status(exception.status).send({
      statusCode: exception.status,
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    });
  }
}
