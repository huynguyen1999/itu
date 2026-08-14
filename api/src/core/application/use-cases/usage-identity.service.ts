import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { IUsageRepository, UsageAppIdentityWrite } from '@core/application/ports/out/repositories.port';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import type { UsageAppIconInput } from './usage.types';
import { requireText } from './usage-validation';

/** App identity and icon persistence use cases. */
export class UsageIdentityService {
  constructor(
    private readonly usage: IUsageRepository,
    private readonly media?: IMediaStorage,
  ) {}

  async replaceAppIcon(userId: string, input: UsageAppIconInput) {
    const bundleId = requireText(input.bundleId, 'bundleId');
    const displayName = requireText(input.displayName, 'displayName').trim();
    if (!displayName) throw new BadRequestException('displayName is required and must be at most 255 characters');
    if (!this.media) throw new Error('Media storage is not configured');

    const hash = createHash('sha256').update(input.buffer).digest('hex');
    const existing = await this.usage.findAppIdentity(userId, bundleId);
    if (existing?.iconHash === hash && existing.iconStorageKey) {
      const identity = await this.usage.upsertAppIdentity(userId, {
        bundleId,
        displayName,
        iconHash: hash,
        iconStorageKey: existing.iconStorageKey,
      });
      return { bundleId: identity.bundleId, displayName: identity.displayName, ...this.iconResponse(identity.iconHash, identity.iconStorageKey) };
    }

    const stored = await this.media.storeUserImage({
      userId,
      folder: 'usage-app-icons',
      originalName: input.originalName,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });
    const write: UsageAppIdentityWrite = {
      bundleId,
      displayName,
      iconHash: hash,
      iconStorageKey: stored.storageKey,
    };
    let identity;
    try {
      identity = await this.usage.upsertAppIdentity(userId, write);
    } catch (error) {
      await this.media.delete(stored.storageKey).catch(() => undefined);
      throw error;
    }
    if (existing?.iconStorageKey && existing.iconStorageKey !== stored.storageKey) {
      await this.media.delete(existing.iconStorageKey).catch(() => undefined);
    }
    return { bundleId: identity.bundleId, displayName: identity.displayName, ...this.iconResponse(identity.iconHash, identity.iconStorageKey) };
  }

  private iconResponse(iconHash?: string | null, iconStorageKey?: string | null) {
    return { ...(iconHash ? { iconHash } : {}), ...(iconStorageKey ? { iconUrl: `/media/${iconStorageKey}` } : {}) };
  }

}
