import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppVersionPolicyPort } from '@core/application/ports/out/app-version-policy.port';
import {
  compareNumericVersions,
  NUMERIC_VERSION_PATTERN,
  type AppVersionChannel,
  type AppVersionPlatform,
  type AppVersionRelease,
} from '@core/domain/app-version';

type AppVersionPolicy = Record<string, Record<string, AppVersionRelease>>;

export class JsonAppVersionPolicyAdapter implements AppVersionPolicyPort {
  private readonly policy: AppVersionPolicy;

  constructor(filePath = path.resolve(process.cwd(), 'config/app-versions.json')) {
    try {
      this.policy = validateAppVersionPolicy(JSON.parse(readFileSync(filePath, 'utf8')) as unknown);
    } catch (error) {
      throw new Error(
        `Unable to load app version policy at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  findRelease(platform: AppVersionPlatform, channel: AppVersionChannel): AppVersionRelease | undefined {
    return this.policy[platform]?.[channel];
  }
}

export function validateAppVersionPolicy(value: unknown): AppVersionPolicy {
  if (!isRecord(value)) throw new Error('App version policy must be an object');

  for (const [platform, channels] of Object.entries(value)) {
    if (!isRecord(channels)) throw new Error(`App version policy for ${platform} must be an object`);
    for (const [channel, release] of Object.entries(channels)) validateRelease(platform, channel, release);
  }

  return value as AppVersionPolicy;
}

function validateRelease(platform: string, channel: string, value: unknown): asserts value is AppVersionRelease {
  if (!isRecord(value)) throw new Error(`App version release for ${platform}/${channel} must be an object`);

  for (const field of ['latestVersion', 'minimumSupportedVersion'] as const) {
    if (typeof value[field] !== 'string' || !NUMERIC_VERSION_PATTERN.test(value[field])) {
      throw new Error(`App version ${platform}/${channel}.${field} is invalid`);
    }
  }
  const minimumSupportedVersion = value.minimumSupportedVersion as string;
  const latestVersion = value.latestVersion as string;
  if (compareNumericVersions(minimumSupportedVersion, latestVersion) > 0) {
    throw new Error(`App version ${platform}/${channel} minimumSupportedVersion exceeds latestVersion`);
  }
  if (value.updateUrl !== null && (typeof value.updateUrl !== 'string' || !isHttpsUrl(value.updateUrl))) {
    throw new Error(`App version ${platform}/${channel}.updateUrl is invalid`);
  }
  if (typeof value.releasedAt !== 'string' || Number.isNaN(Date.parse(value.releasedAt))) {
    throw new Error(`App version ${platform}/${channel}.releasedAt is invalid`);
  }
  if (typeof value.title !== 'string' || value.title.trim().length === 0) {
    throw new Error(`App version ${platform}/${channel}.title is invalid`);
  }
  if (
    !Array.isArray(value.releaseNotes) ||
    value.releaseNotes.length === 0 ||
    !value.releaseNotes.every((note) => typeof note === 'string' && note.trim().length > 0)
  ) {
    throw new Error(`App version ${platform}/${channel}.releaseNotes is invalid`);
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
