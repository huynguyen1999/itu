import { Module } from '@nestjs/common';
import { CardService } from '@core/application/use-cases/card.service';
import { CardsController } from '@infrastructure/transport/rest/controllers/cards.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { PermissionsGuard } from '@infrastructure/transport/rest/guards/permissions.guard';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [CardsController],
  providers: [PermissionsGuard, CardService],
  exports: [CardService],
})
export class CardsModule {}

