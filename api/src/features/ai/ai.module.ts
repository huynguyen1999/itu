import { Module } from '@nestjs/common';
import { AiService } from '@core/application/use-cases/ai.service';
import { AiController } from '@infrastructure/transport/rest/controllers/ai.controller';
import { AiRateLimitGuard } from '@infrastructure/transport/rest/guards/ai-rate-limit.guard';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { AiProviderModule } from '@infrastructure/ai/ai-provider.module';
import { PermissionsGuard } from '@infrastructure/transport/rest/guards/permissions.guard';
import { MediaModule } from '@infrastructure/media/media.module';

@Module({
  imports: [AuthModule, PersistenceModule, QueueModule, AiProviderModule, MediaModule],
  controllers: [AiController],
  providers: [
    AiRateLimitGuard,
    PermissionsGuard,
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
