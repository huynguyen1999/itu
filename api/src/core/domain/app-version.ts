export const APP_VERSION_PLATFORMS = ['ios', 'macos'] as const;
export type AppVersionPlatform = (typeof APP_VERSION_PLATFORMS)[number];

export const APP_VERSION_CHANNELS = ['stable'] as const;
export type AppVersionChannel = (typeof APP_VERSION_CHANNELS)[number];

export type AppVersionStatus = 'CURRENT' | 'OPTIONAL_UPDATE' | 'REQUIRED_UPDATE';

export const APP_VERSION_ERRORS = {
  platformInvalid: 'APP_VERSION_PLATFORM_INVALID',
  versionInvalid: 'APP_VERSION_VERSION_INVALID',
  policyNotConfigured: 'APP_VERSION_POLICY_NOT_CONFIGURED',
} as const;

export const NUMERIC_VERSION_PATTERN = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))+$/;

export interface AppVersionRelease {
  latestVersion: string;
  minimumSupportedVersion: string;
  updateUrl: string | null;
  releasedAt: string;
  title: string;
  releaseNotes: string[];
}

export interface AppVersionCheck {
  platform: AppVersionPlatform;
  channel: AppVersionChannel;
  version: string;
}

export interface AppVersionCheckResult {
  platform: AppVersionPlatform;
  channel: AppVersionChannel;
  installedVersion: string;
  latestVersion: string;
  minimumSupportedVersion: string;
  status: AppVersionStatus;
  release: {
    version: string;
    releasedAt: string;
    title: string;
    notes: string[];
  };
  update: { url: string } | null;
}

export function compareNumericVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  return 0;
}
