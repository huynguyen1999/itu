import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MEDIA_ERRORS, REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { CardService } from '@core/application/use-cases/card.service';
import { CardSide } from '@core/domain/enums';
import { AuthGuard } from '../guards/auth.guard';
import { CreateCardDto, UpdateCardDto, ImportCardsDto, MoveCardsDto, toCardImageResponseDto } from '../dto/cards.dto';
import { CursorPageQueryDto } from '../dto/pagination.dto';
import type { AuthenticatedMultipartRequest, AuthenticatedRequest } from '../types/authenticated-request';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PERMISSIONS } from '@core/application/constants/permissions';

import { ApiParam } from '@nestjs/swagger';

@UseGuards(AuthGuard)
@Controller()
export class CardsController {
  constructor(private readonly cards: CardService) {}

  /**
   * Import flashcard decks and cards in bulk.
   *
   * @description Batch imports decks and flashcards from an external file/JSON structure.
   * @why Enables users to import decks from CSV/Anki or existing study materials.
   * @when Called when the user uploads a deck package or CSV in the deck import UI.
   */
  @Post(REST_ROUTES.importDecks)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.cardImport)
  importCards(@Req() req: AuthenticatedRequest, @Body() dto: ImportCardsDto) {
    return this.cards.importCards(req.user.sub, dto);
  }

  /**
   * Move cards between decks.
   *
   * @description Moves a batch of cards from their current deck to a target deck.
   * @why Allows re-organizing flashcards across different study subjects.
   * @when Called when drag-and-dropping or selecting "Move to Deck" in the card management UI.
   */
  @Post(REST_ROUTES.cardsMove)
  move(@Req() req: AuthenticatedRequest, @Body() dto: MoveCardsDto) {
    return this.cards.move(req.user.sub, dto);
  }

  /**
   * List cards in a deck.
   *
   * @description Retrieves a paginated list of cards belonging to a specific deck.
   * @why Required to view and manage flashcards inside a deck.
   * @when Called when the user opens a deck detail view or card list page.
   */
  @Get(REST_ROUTES.cardsByDeck)
  list(
    @Req() req: AuthenticatedRequest,
    @Param(ROUTE_PARAMS.deckId) deckId: string,
    @Query() query: CursorPageQueryDto,
  ) {
    return this.cards.list(req.user.sub, deckId, query);
  }

  /**
   * Create a new flashcard.
   *
   * @description Creates a single flashcard with front/back text inside a deck.
   * @why Allows users to populate decks with study flashcards manually.
   * @when Called when submitting the "Add Card" form in a deck editor.
   */
  @Post(REST_ROUTES.cardsByDeck)
  create(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deckId) deckId: string, @Body() dto: CreateCardDto) {
    return this.cards.create(req.user.sub, deckId, dto);
  }

  /**
   * Update a flashcard.
   *
   * @description Modifies the front/back content or formatting of an existing card.
   * @why Allows editing mistakes or updating study content on existing flashcards.
   * @when Called when saving changes in the card editor modal.
   */
  @ApiParam({ name: 'deckId', required: true })
  @Patch(REST_ROUTES.cardByDeck)
  update(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.cardId) cardId: string, @Body() dto: UpdateCardDto) {
    return this.cards.update(req.user.sub, cardId, dto);
  }

  /**
   * Delete a flashcard.
   *
   * @description Soft deletes or permanently removes a card from a deck.
   * @why Allows removing obsolete or duplicate study flashcards.
   * @when Called when clicking the trash icon on a card row.
   */
  @ApiParam({ name: 'deckId', required: true })
  @Delete(REST_ROUTES.cardByDeck)
  remove(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.cardId) cardId: string) {
    return this.cards.remove(req.user.sub, cardId);
  }

  /**
   * Attach image to flashcard side.
   *
   * @description Uploads and attaches a media image to either front or back side of a card.
   * @why Supports rich visual study material on flashcards.
   * @when Called when uploading an image file while editing a card side.
   */
  @Post(REST_ROUTES.cardImages)
  async attachImage(@Req() req: AuthenticatedMultipartRequest, @Param(ROUTE_PARAMS.cardId) cardId: string) {
    const upload = await req.file();
    if (!upload) throw new BadRequestException(MEDIA_ERRORS.imageFileRequired);
    const sideField = upload.fields.side as { value?: string } | undefined;
    const side = sideField?.value;
    if (!side || !Object.values(CardSide).includes(side as CardSide)) {
      throw new BadRequestException(MEDIA_ERRORS.invalidImageSide);
    }

    const image = await this.cards.attachImage(req.user.sub, {
      cardId,
      side: side as CardSide,
      originalName: upload.filename,
      mimeType: upload.mimetype,
      buffer: await upload.toBuffer(),
    });
    return toCardImageResponseDto(image);
  }

  /**
   * Remove image from flashcard.
   *
   * @description Deletes an attached image asset from a card.
   * @why Allows removing unwanted visual attachments from flashcards.
   * @when Called when clicking the remove image button on a card side.
   */
  @Delete(REST_ROUTES.cardImage)
  removeImage(
    @Req() req: AuthenticatedRequest,
    @Param(ROUTE_PARAMS.cardId) cardId: string,
    @Param(ROUTE_PARAMS.imageId) imageId: string,
  ) {
    return this.cards.removeImage(req.user.sub, cardId, imageId);
  }
}
