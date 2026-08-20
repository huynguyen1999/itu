import type { AppVersionChannel, AppVersionPlatform, AppVersionRelease } from '@core/domain/app-version';

export const APP_VERSION_POLICY_PORT = Symbol('APP_VERSION_POLICY_PORT');

export interface AppVersionPolicyPort {
  findRelease(platform: AppVersionPlatform, channel: AppVersionChannel): AppVersionRelease | undefined;
}
