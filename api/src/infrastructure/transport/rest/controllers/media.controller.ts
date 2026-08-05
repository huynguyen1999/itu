import { Controller, Get, Inject, NotFoundException, Param, Req, Res, UseGuards } from '@nestjs/common';
import { MEDIA_CONSTANTS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { ICardRepository } from '@core/application/ports/out/repositories.port';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import type { FastifyReply } from 'fastify';
import type { IProductivityRepository } from '@core/application/ports/out/repositories.port';

type MediaRouteParams = {
  '*': string;
};

@UseGuards(AuthGuard)
@Controller()
export class MediaController {
  constructor(
    @Inject(TOKENS.CARD_REPOSITORY) private readonly cards: ICardRepository,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly media: IMediaStorage,
    @Inject(TOKENS.PRODUCTIVITY_REPOSITORY) private readonly productivity: IProductivityRepository,
  ) {}

  /**
   * Serve stored image asset.
   *
   * @description Streams a stored media image file by its storage key with proper content headers.
   * @why Enables secure rendering of media assets attached to flashcards/notes without exposing public bucket URLs.
   * @when Called by the browser/app UI (`<img src="/media/..." />`) whenever displaying flashcard image content.
   */
  @Get(`${MEDIA_CONSTANTS.serveRoot.slice(1)}/*`)
  async getImage(@Req() req: AuthenticatedRequest, @Param() params: MediaRouteParams, @Res() res: FastifyReply) {
    const storageKey = params['*'];
    if (storageKey.startsWith('audio/')) {
      const audioStorageKey = storageKey.slice('audio/'.length);
      const sound = await this.productivity.findFocusSoundByStorageKey(req.user.sub, audioStorageKey);
      if (!sound) throw new NotFoundException();
      const stream = await this.media.read(sound.storageKey);
      if (!stream) throw new NotFoundException();
      res.header('Content-Type', sound.mimeType);
      res.header('Cache-Control', 'private, max-age=3600');
      return res.send(stream);
    }
    const image = await this.cards.findImageByStorageKey(req.user.sub, storageKey);
    const isOwnedGrowthIcon = storageKey.startsWith(`${req.user.sub}/growth-icons/`);
    if (!image && !isOwnedGrowthIcon) throw new NotFoundException();

    const stream = await this.media.read(image?.storageKey ?? storageKey);
    if (!stream) throw new NotFoundException();

    res.header('Content-Type', image?.mimeType ?? MEDIA_CONSTANTS.outputMimeType);
    res.header('Cache-Control', 'private, max-age=3600');
    return res.send(stream);
  }

}
