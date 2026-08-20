import { IsEnum, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { SyncDevicePlatform } from '@core/domain/enums';

export class RegisterDeviceDto {
  @IsString()
  @Length(1, 128)
  deviceId!: string;

  @IsEnum(SyncDevicePlatform)
  platform!: SyncDevicePlatform;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  pushToken?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  lastKnownSyncCursor?: string;

  @IsOptional()
  @IsObject()
  notificationPreference?: Record<string, unknown>;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @Length(1, 512)
  pushToken?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  lastKnownSyncCursor?: string;

  @IsOptional()
  @IsObject()
  notificationPreference?: Record<string, unknown>;
}
