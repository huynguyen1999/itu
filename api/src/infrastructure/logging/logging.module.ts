import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';
import { WinstonLoggerService } from './winston-logger.service';

@Global()
@Module({
  providers: [
    RequestContextService,
    RequestContextMiddleware,
    WinstonLoggerService,
    { provide: TOKENS.LOGGER, useExisting: WinstonLoggerService },
  ],
  exports: [TOKENS.LOGGER],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
