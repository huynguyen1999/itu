import { Module } from '@nestjs/common';
import { CardService } from '@core/application/use-cases/card.service';
import { CardsController } from '@infrastructure/transport/rest/controllers/cards.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { PermissionsGuard } from '@infrastructure/transport/rest/guards/permissions.guard';
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [CardsController],
  providers: [
    PermissionsGuard,
    {
      provide: CardService,
      useFactory: (decks, cards, reviewStates, media) => new CardService(decks, cards, reviewStates, media),
      inject: [TOKENS.DECK_REPOSITORY, TOKENS.CARD_REPOSITORY, TOKENS.REVIEW_STATE_REPOSITORY, TOKENS.MEDIA_STORAGE],
    },
  ],
  exports: [CardService],
})
export class CardsModule {}
