import { Module } from '@nestjs/common';
import { AuthService } from '@core/application/use-cases/auth.service';
import { AuthController } from '@infrastructure/transport/rest/controllers/auth.controller';
import { AuthGuard } from '@infrastructure/transport/rest/guards/auth.guard';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { SecurityModule } from '@infrastructure/security/security.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { GoogleStrategy } from '@infrastructure/security/google.strategy';
import { GoogleAuthGuard } from '@infrastructure/transport/rest/guards/google-auth.guard';
import { TOKENS } from '@core/application/constants/tokens';
import { GOOGLE_OAUTH_PORT, type GoogleOAuthPort } from '@core/application/ports/out/google-oauth.port';
import { GoogleOAuthAdapter } from '@infrastructure/security/google-oauth.adapter';

@Module({
  imports: [PersistenceModule, SecurityModule, QueueModule],
  controllers: [AuthController],
  providers: [
    AuthGuard,
    GoogleAuthGuard,
    GoogleStrategy,
    GoogleOAuthAdapter,
    { provide: GOOGLE_OAUTH_PORT, useExisting: GoogleOAuthAdapter },
    {
      provide: AuthService,
      useFactory: (users, hasher, tokens, queue, refreshSessions, oauthHandoffs, access, googleOAuth: GoogleOAuthPort) =>
        new AuthService(users, hasher, tokens, queue, refreshSessions, oauthHandoffs, access, googleOAuth),
      inject: [
        TOKENS.USER_REPOSITORY,
        TOKENS.PASSWORD_HASHER,
        TOKENS.TOKEN_SERVICE,
        TOKENS.QUEUE_JOB_HANDLER,
        TOKENS.REFRESH_SESSION_REPOSITORY,
        TOKENS.OAUTH_HANDOFF_REPOSITORY,
        TOKENS.ACCESS_REPOSITORY,
        GOOGLE_OAUTH_PORT,
      ],
    },
  ],
  exports: [AuthGuard, AuthService, SecurityModule],
})
export class AuthModule {}
