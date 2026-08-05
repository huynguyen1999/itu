import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { IPasswordHasher, IQueueJobHandler, ITokenService } from '@core/application/ports/out/services.port';
import {
  IOAuthHandoffRepository,
  IRefreshSessionRepository,
  IUserRepository,
} from '@core/application/ports/out/repositories.port';
import { AuthService } from '@core/application/use-cases/auth.service';
import { AuthController } from '@infrastructure/transport/rest/controllers/auth.controller';
import { AuthGuard } from '@infrastructure/transport/rest/guards/auth.guard';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { SecurityModule } from '@infrastructure/security/security.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { GoogleStrategy } from '@infrastructure/security/google.strategy';
import { GoogleAuthGuard } from '@infrastructure/transport/rest/guards/google-auth.guard';
import type { IAccessRepository } from '@core/application/ports/out/access-repository.port';

@Module({
  imports: [PersistenceModule, SecurityModule, QueueModule],
  controllers: [AuthController],
  providers: [
    AuthGuard,
    GoogleAuthGuard,
    GoogleStrategy,
    {
      provide: TOKENS.AUTH_USE_CASE,
      useFactory: (
        users: IUserRepository,
        hasher: IPasswordHasher,
        tokens: ITokenService,
        queue: IQueueJobHandler,
        refreshSessions: IRefreshSessionRepository,
        oauthHandoffs: IOAuthHandoffRepository,
        access: IAccessRepository,
      ) => new AuthService(users, hasher, tokens, queue, refreshSessions, oauthHandoffs, access),
      inject: [
        TOKENS.USER_REPOSITORY,
        TOKENS.PASSWORD_HASHER,
        TOKENS.TOKEN_SERVICE,
        TOKENS.QUEUE_JOB_HANDLER,
        TOKENS.REFRESH_SESSION_REPOSITORY,
        TOKENS.OAUTH_HANDOFF_REPOSITORY,
        TOKENS.ACCESS_REPOSITORY,
      ],
    },
  ],
  exports: [AuthGuard, TOKENS.AUTH_USE_CASE, SecurityModule],
})
export class AuthModule {}
