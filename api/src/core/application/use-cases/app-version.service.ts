import type { AppVersionPolicyPort } from '@core/application/ports/out/app-version-policy.port';
import {
  APP_VERSION_ERRORS,
  compareNumericVersions,
  type AppVersionCheck,
  type AppVersionCheckResult,
} from '@core/domain/app-version';
import { DomainException } from '@core/domain/exceptions';

export class AppVersionService {
  constructor(private readonly policy: AppVersionPolicyPort) {}

  check(query: AppVersionCheck): AppVersionCheckResult {
    const release = this.policy.findRelease(query.platform, query.channel);
    if (!release) {
      throw new DomainException(
        `App version policy is not configured for ${query.platform}/${query.channel}`,
        APP_VERSION_ERRORS.policyNotConfigured,
        500,
      );
    }

    const installedVsLatest = compareNumericVersions(query.version, release.latestVersion);
    const installedVsMinimum = compareNumericVersions(query.version, release.minimumSupportedVersion);

    return {
      platform: query.platform,
      channel: query.channel,
      installedVersion: query.version,
      latestVersion: release.latestVersion,
      minimumSupportedVersion: release.minimumSupportedVersion,
      status: installedVsLatest >= 0 ? 'CURRENT' : installedVsMinimum >= 0 ? 'OPTIONAL_UPDATE' : 'REQUIRED_UPDATE',
      release: {
        version: release.latestVersion,
        releasedAt: release.releasedAt,
        title: release.title,
        notes: release.releaseNotes,
      },
      update: release.updateUrl ? { url: release.updateUrl } : null,
    };
  }
}
