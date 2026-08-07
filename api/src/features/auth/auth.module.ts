import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { AuthService } from '@core/application/use-cases/auth.service';
import { AuthController } from '@infrastructure/transport/rest/controllers/auth.controller';
import { AuthGuard } from '@infrastructure/transport/rest/guards/auth.guard';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { SecurityModule } from '@infrastructure/security/security.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { GoogleStrategy } from '@infrastructure/security/google.strategy';
import { GoogleAuthGuard } from '@infrastructure/transport/rest/guards/google-auth.guard';

@Module({
  imports: [PersistenceModule, SecurityModule, QueueModule],
  controllers: [AuthController],
  providers: [
    AuthGuard,
    GoogleAuthGuard,
    GoogleStrategy,
    AuthService,
    { provide: TOKENS.AUTH_USE_CASE, useExisting: AuthService },
  ],
  exports: [AuthGuard, AuthService, TOKENS.AUTH_USE_CASE, SecurityModule],
})
export class AuthModule {}

