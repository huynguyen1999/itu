import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class SyncMutationDto {
  @IsString()
  @Length(10, 80)
  id!: string;

  @IsString()
  @Length(3, 60)
  kind!: string;

  @IsString()
  @Length(10, 80)
  entityId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseVersion?: number;

  @IsOptional()
  @IsObject()
  baseValues?: Record<string, unknown>;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsDateString()
  occurredAt!: string;
}

export class SyncRequestDto {
  @IsString()
  @Length(12, 128)
  deviceId!: string;

  @IsString()
  @Length(12, 128)
  clientInstanceId!: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  lastSyncTime?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncMutationDto)
  mutations!: SyncMutationDto[];
}

export class PushSyncMutationsDto {
  @IsString()
  @Length(12, 128)
  deviceId!: string;

  @IsString()
  @Length(12, 128)
  clientInstanceId!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncMutationDto)
  mutations!: SyncMutationDto[];
}

export class PullSyncChangesDto {
  @IsString()
  @Length(12, 128)
  deviceId!: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
