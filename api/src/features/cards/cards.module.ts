import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { CardService } from '@core/application/use-cases/card.service';
import {
  ICardRepository,
  IDeckRepository,
  IReviewStateRepository,
} from '@core/application/ports/out/repositories.port';
import { IMediaStorage } from '@core/application/ports/out/services.port';
import { CardsController } from '@infrastructure/transport/rest/controllers/cards.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { PermissionsGuard } from '@infrastructure/transport/rest/guards/permissions.guard';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [CardsController],
  providers: [
    PermissionsGuard,
    {
      provide: TOKENS.CARD_USE_CASE,
      useFactory: (
        decks: IDeckRepository,
        cards: ICardRepository,
        reviewStates: IReviewStateRepository,
        media: IMediaStorage,
      ) => new CardService(decks, cards, reviewStates, media),
      inject: [TOKENS.DECK_REPOSITORY, TOKENS.CARD_REPOSITORY, TOKENS.REVIEW_STATE_REPOSITORY, TOKENS.MEDIA_STORAGE],
    },
  ],
  exports: [TOKENS.CARD_USE_CASE],
})
export class CardsModule {}
