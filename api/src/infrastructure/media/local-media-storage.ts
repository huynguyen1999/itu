import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { CONFIG_KEYS, DEFAULT_URLS, MEDIA_CONSTANTS, MEDIA_ERRORS } from '@core/application/constants/app.constants';
import { IMediaStorage, StoredAudio, StoredImage } from '@core/application/ports/out/services.port';
import type { StoreAudioInput, StoreCardImageInput, StoreUserImageInput } from '@core/application/ports/out/service-types.port';
import { InvalidReviewException } from '@core/domain/exceptions';

const ALLOWED_TYPES = new Set<string>(MEDIA_CONSTANTS.allowedImageMimeTypes);

@Injectable()
export class LocalMediaStorage implements IMediaStorage {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.get<string>(CONFIG_KEYS.mediaRoot, DEFAULT_URLS.mediaRoot));
    this.baseUrl = config.get<string>(CONFIG_KEYS.mediaPublicBaseUrl, DEFAULT_URLS.mediaBaseUrl);
  }

  async storeCardImage(input: StoreCardImageInput): Promise<StoredImage> {
    return this.storeProcessedImage({
      userId: input.userId,
      folder: input.cardId,
      originalName: input.originalName,
      mimeType: input.mimeType,
      buffer: input.buffer,
      sortOrder: input.sortOrder,
    });
  }

  async storeUserImage(input: StoreUserImageInput): Promise<StoredImage> {
    return this.storeProcessedImage({ ...input, sortOrder: 0 });
  }

  async storeAudio(input: StoreAudioInput): Promise<StoredAudio> {
    if (!MEDIA_CONSTANTS.allowedAudioMimeTypes.includes(input.mimeType)) {
      throw new InvalidReviewException(MEDIA_ERRORS.unsupportedAudioType);
    }
    if (input.buffer.byteLength > MEDIA_CONSTANTS.maxAudioBytes) {
      throw new InvalidReviewException(MEDIA_ERRORS.audioTooLarge);
    }
    const folder = path.join(this.root, input.userId, 'focus-sounds');
    await fs.mkdir(folder, { recursive: true });
    const extension = path.extname(input.originalName).toLowerCase() || '.mp3';
    const storageKey = `${input.userId}/focus-sounds/${input.soundId}-${slug(input.originalName)}${extension}`;
    await fs.writeFile(path.join(this.root, storageKey), input.buffer);
    return {
      storageKey,
      url: `${this.baseUrl}/audio/${storageKey}`,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
    };
  }

  private async storeProcessedImage(input: StoreUserImageInput & { sortOrder: number }): Promise<StoredImage> {
    if (!ALLOWED_TYPES.has(input.mimeType)) {
      throw new InvalidReviewException(MEDIA_ERRORS.unsupportedImageType);
    }
    if (input.buffer.byteLength > MEDIA_CONSTANTS.maxImageBytes) {
      throw new InvalidReviewException(MEDIA_ERRORS.imageTooLarge);
    }

    const directory = path.join(this.root, input.userId, input.folder);
    await fs.mkdir(directory, { recursive: true });

    const storageKey = `${input.userId}/${input.folder}/${Date.now()}-${slug(input.originalName)}.${MEDIA_CONSTANTS.outputExtension}`;
    const absolutePath = path.join(this.root, storageKey);
    const result = await sharp(input.buffer)
      .rotate()
      .resize({
        width: MEDIA_CONSTANTS.resizeMaxWidth,
        height: MEDIA_CONSTANTS.resizeMaxHeight,
        fit: MEDIA_CONSTANTS.resizeFit,
        withoutEnlargement: true,
      })
      .webp({ quality: MEDIA_CONSTANTS.webpQuality })
      .toFile(absolutePath);

    return {
      storageKey,
      url: `${this.baseUrl}/${storageKey}`,
      mimeType: MEDIA_CONSTANTS.outputMimeType,
      width: result.width,
      height: result.height,
      sizeBytes: result.size,
      sortOrder: input.sortOrder,
    };
  }

  async delete(storageKey: string): Promise<void> {
    await fs.rm(path.join(this.root, storageKey), { force: true });
  }

  async read(storageKey: string) {
    const absolutePath = this.resolveStoragePath(storageKey);
    if (!absolutePath) return null;

    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) return null;
      return createReadStream(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private resolveStoragePath(storageKey: string): string | null {
    const absolutePath = path.resolve(this.root, storageKey);
    const relative = path.relative(this.root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return absolutePath;
  }
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || MEDIA_CONSTANTS.defaultImageSlug
  ).slice(0, 80);
}
