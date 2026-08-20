import { IsEnum, IsString, Matches } from 'class-validator';
import {
  APP_VERSION_CHANNELS,
  APP_VERSION_ERRORS,
  APP_VERSION_PLATFORMS,
  NUMERIC_VERSION_PATTERN,
  type AppVersionChannel,
  type AppVersionPlatform,
} from '@core/domain/app-version';

export class CheckAppVersionQueryDto {
  @IsEnum(APP_VERSION_PLATFORMS, { message: APP_VERSION_ERRORS.platformInvalid })
  platform!: AppVersionPlatform;

  @IsString({ message: APP_VERSION_ERRORS.versionInvalid })
  @Matches(NUMERIC_VERSION_PATTERN, { message: APP_VERSION_ERRORS.versionInvalid })
  version!: string;

  @IsEnum(APP_VERSION_CHANNELS)
  channel!: AppVersionChannel;
}
