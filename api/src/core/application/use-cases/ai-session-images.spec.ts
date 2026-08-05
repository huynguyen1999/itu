import { Readable } from 'stream';
import { hydrateSessionReviewImages } from './ai-session-images';
import type { IMediaStorage, ILogger } from '@core/application/ports/out/services.port';
import type { StudySessionReviewData } from '@core/application/ports/out/repository-types.port';
import { CardSide, ReviewDirection, ReviewGrade } from '@core/domain/enums';

describe('hydrateSessionReviewImages', () => {
  it('loads ordered image bytes without exposing storage keys to the provider input', async () => {
    const reviews: StudySessionReviewData[] = [
      {
        cardId: 'card-1',
        direction: ReviewDirection.FRONT_TO_BACK,
        grade: ReviewGrade.GOOD,
        promptRichText: 'Question',
        answerRichText: 'Answer',
        images: [
          {
            side: CardSide.PROMPT,
            storageKey: 'private/image.webp',
            mimeType: 'image/webp',
            sortOrder: 0,
            sizeBytes: 3,
          },
        ],
      },
    ];
    const media = {
      read: jest.fn().mockResolvedValue(Readable.from([Buffer.from('img')])),
    } as unknown as IMediaStorage;
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as ILogger;

    const result = await hydrateSessionReviewImages(reviews, media, logger);

    expect(result[0].images).toEqual([
      {
        side: CardSide.PROMPT,
        mimeType: 'image/webp',
        data: Buffer.from('img').toString('base64'),
        sortOrder: 0,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('private/image.webp');
  });
});
