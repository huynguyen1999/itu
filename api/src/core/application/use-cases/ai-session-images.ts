import { AI_IMAGE_LIMITS } from '@core/application/constants/app.constants';
import type { StudySessionReviewData } from '@core/application/ports/out/repository-types.port';
import type { IMediaStorage, ILogger } from '@core/application/ports/out/services.port';
import type { SessionReviewItem } from '@core/application/ports/out/service-types.port';

export async function hydrateSessionReviewImages(
  reviews: StudySessionReviewData[],
  media: IMediaStorage,
  logger: ILogger,
): Promise<SessionReviewItem[]> {
  let imageCount = 0;
  let totalBytes = 0;

  return Promise.all(
    reviews.map(async (review) => {
      const images = [];
      const candidates = [...review.images]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, AI_IMAGE_LIMITS.maxImagesPerCard);

      for (const image of candidates) {
        if (imageCount >= AI_IMAGE_LIMITS.maxImagesPerSession) break;
        if (totalBytes + image.sizeBytes > AI_IMAGE_LIMITS.maxTotalBytes) break;

        const stream = await media.read(image.storageKey);
        if (!stream) {
          logger.warn('AI review image was unavailable; continuing without it', {
            cardId: review.cardId,
            side: image.side,
          });
          continue;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        if (totalBytes + buffer.byteLength > AI_IMAGE_LIMITS.maxTotalBytes) break;

        images.push({
          side: image.side,
          mimeType: image.mimeType,
          data: buffer.toString('base64'),
          sortOrder: image.sortOrder,
        });
        imageCount += 1;
        totalBytes += buffer.byteLength;
      }

      return { ...review, images };
    }),
  );
}
