import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { IDeckUseCase } from '@core/application/ports/in/deck-use-case.port';
import { AuthGuard } from '../guards/auth.guard';
import { CreateDeckDto, UpdateDeckDto } from '../dto/decks.dto';
import { CursorPageQueryDto } from '../dto/pagination.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.decks)
export class DecksController {
  constructor(@Inject(TOKENS.DECK_USE_CASE) private readonly decks: IDeckUseCase) {}

  /**
   * List user's flashcard decks.
   *
   * @description Fetches all flashcard decks owned by the authenticated user.
   * @why Required to render the user's study library/deck collection.
   * @when Called upon opening the main Learn tab or study deck manager.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.decks.list(req.user.sub, query);
  }

  /**
   * Get single deck details.
   *
   * @description Fetches detailed information for a specific deck by ID.
   * @why Provides deck metadata, card counts, and settings for deck detail view.
   * @when Called when selecting a deck to inspect or configure.
   */
  @Get(REST_ROUTES.deckById)
  get(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deckId) deckId: string) {
    return this.decks.get(req.user.sub, deckId);
  }

  /**
   * Create new deck.
   *
   * @description Creates a new flashcard deck container.
   * @why Allows users to create new subjects/topics for learning.
   * @when Called when submitting the "New Deck" dialog form.
   */
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateDeckDto) {
    return this.decks.create(req.user.sub, dto);
  }

  /**
   * Update deck details.
   *
   * @description Modifies a deck's title, description, or settings.
   * @why Allows renaming or re-configuring existing decks.
   * @when Called when editing deck settings in the UI.
   */
  @Patch(REST_ROUTES.deckById)
  update(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deckId) deckId: string, @Body() dto: UpdateDeckDto) {
    return this.decks.update(req.user.sub, deckId, dto);
  }

  /**
   * Delete deck.
   *
   * @description Removes a deck and soft-deletes its child flashcards.
   * @why Allows users to clean up obsolete flashcard decks.
   * @when Called when confirming deck deletion.
   */
  @Delete(REST_ROUTES.deckById)
  remove(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deckId) deckId: string) {
    return this.decks.remove(req.user.sub, deckId);
  }
}
