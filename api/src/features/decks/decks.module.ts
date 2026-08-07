import { Module } from '@nestjs/common';
import { DeckService } from '@core/application/use-cases/deck.service';
import { DecksController } from '@infrastructure/transport/rest/controllers/decks.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DecksController],
  providers: [DeckService],
  exports: [DeckService],
})
export class DecksModule {}

