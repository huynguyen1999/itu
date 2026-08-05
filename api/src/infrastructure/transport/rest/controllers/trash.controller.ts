import { Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { ITrashUseCase } from '@core/application/ports/in/trash-use-case.port';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.trash)
export class TrashController {
  constructor(@Inject(TOKENS.TRASH_USE_CASE) private readonly trash: ITrashUseCase) {}

  /**
   * List trash items.
   *
   * @description Retrieves a list of all soft-deleted items (decks, cards, tasks, images) for the user.
   * @why Renders soft-deleted entities inside the app trash/recovery bin view.
   * @when Called when the user opens the Trash / Archive screen.
   */
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.trash.list(req.user.sub);
  }

  /**
   * Restore soft-deleted deck.
   *
   * @description Restores a soft-deleted flashcard deck back to active status.
   * @why Enables recovery of accidentally deleted flashcard decks.
   * @when Called when clicking "Restore" on a deck in Trash.
   */
  @Post(REST_ROUTES.trashDeckRestore)
  restoreDeck(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deckId) deckId: string) {
    return this.trash.restoreDeck(req.user.sub, deckId);
  }

  /**
   * Restore soft-deleted card.
   *
   * @description Restores a soft-deleted flashcard back to active status.
   * @why Enables recovery of accidentally deleted flashcards.
   * @when Called when clicking "Restore" on a card in Trash.
   */
  @Post(REST_ROUTES.trashCardRestore)
  restoreCard(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.cardId) cardId: string) {
    return this.trash.restoreCard(req.user.sub, cardId);
  }

  /**
   * Restore soft-deleted card image.
   *
   * @description Restores a soft-deleted card image asset.
   * @why Enables recovery of deleted image attachments.
   * @when Called when clicking "Restore" on an image attachment in Trash.
   */
  @Post(REST_ROUTES.trashCardImageRestore)
  restoreCardImage(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.imageId) imageId: string) {
    return this.trash.restoreCardImage(req.user.sub, imageId);
  }

  /**
   * Restore soft-deleted task.
   *
   * @description Restores a soft-deleted task back to the active task list.
   * @why Enables recovery of accidentally deleted productivity tasks.
   * @when Called when clicking "Restore" on a task in Trash.
   */
  @Post(REST_ROUTES.trashTaskRestore)
  async restoreTask(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.taskId) taskId: string) {
    await this.trash.restoreTask(req.user.sub, taskId);
    return { ok: true };
  }

  /**
   * Permanently delete deck.
   *
   * @description Permanently deletes a deck and all its associated data from the database.
   * @why Cleans up unwanted deleted decks permanently.
   * @when Called when confirming "Delete Forever" on a deck in Trash.
   */
  @Delete(REST_ROUTES.trashDeckDelete)
  async deleteDeck(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deckId) deckId: string) {
    await this.trash.deleteDeck(req.user.sub, deckId);
    return { ok: true };
  }

  /**
   * Permanently delete card.
   *
   * @description Permanently removes a flashcard record from the database.
   * @why Cleans up unwanted deleted flashcards permanently.
   * @when Called when confirming "Delete Forever" on a card in Trash.
   */
  @Delete(REST_ROUTES.trashCardDelete)
  async deleteCard(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.cardId) cardId: string) {
    await this.trash.deleteCard(req.user.sub, cardId);
    return { ok: true };
  }

  /**
   * Permanently delete card image asset.
   *
   * @description Permanently deletes an image file from storage and database.
   * @why Frees up storage space by permanently removing deleted image files.
   * @when Called when confirming "Delete Forever" on an image asset in Trash.
   */
  @Delete(REST_ROUTES.trashCardImageDelete)
  async deleteCardImage(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.imageId) imageId: string) {
    await this.trash.deleteCardImage(req.user.sub, imageId);
    return { ok: true };
  }

  /**
   * Permanently delete task.
   *
   * @description Permanently deletes a task record from the database.
   * @why Permanently purges soft-deleted tasks.
   * @when Called when confirming "Delete Forever" on a task in Trash.
   */
  @Delete(REST_ROUTES.trashTaskDelete)
  async deleteTask(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.taskId) taskId: string) {
    await this.trash.deleteTask(req.user.sub, taskId);
    return { ok: true };
  }
}
