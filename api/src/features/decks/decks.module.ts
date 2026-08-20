import { Module } from '@nestjs/common';
import { DeckService } from '@core/application/use-cases/deck.service';
import { DecksController } from '@infrastructure/transport/rest/controllers/decks.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DecksController],
  providers: [
    {
      provide: DeckService,
      useFactory: (decks, cards) => new DeckService(decks, cards),
      inject: [TOKENS.DECK_REPOSITORY, TOKENS.CARD_REPOSITORY],
    },
  ],
  exports: [DeckService],
})
export class DecksModule {}
