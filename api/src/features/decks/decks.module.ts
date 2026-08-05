import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { ICardRepository, IDeckRepository } from '@core/application/ports/out/repositories.port';
import { DeckService } from '@core/application/use-cases/deck.service';
import { DecksController } from '@infrastructure/transport/rest/controllers/decks.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DecksController],
  providers: [
    {
      provide: TOKENS.DECK_USE_CASE,
      useFactory: (decks: IDeckRepository, cards: ICardRepository) => new DeckService(decks, cards),
      inject: [TOKENS.DECK_REPOSITORY, TOKENS.CARD_REPOSITORY],
    },
  ],
  exports: [TOKENS.DECK_USE_CASE],
})
export class DecksModule {}
