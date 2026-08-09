import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class UsageSummaryDto {
  @IsString()
  @Length(10, 10)
  localDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsString()
  @Length(1, 255)
  bundleId!: string;

  @IsString()
  @Length(1, 255)
  displayName!: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  activeSeconds!: number;
}

export class UsageSummaryBatchDto {
  @IsString()
  @IsNotEmpty()
  @Length(12, 128)
  deviceId!: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => UsageSummaryDto)
  summaries!: UsageSummaryDto[];
}

export class UsageDateQueryDto {
  @IsOptional()
  @IsString()
  @Length(10, 10)
  from?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10)
  to?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Length(10, 10)
  endDate?: string;
}

export class WebsiteUsageSummaryDto {
  @IsString()
  @Length(10, 10)
  localDate!: string;

  @IsString()
  @Length(1, 255)
  browserBundleId!: string;

  @IsString()
  @Length(1, 255)
  browserDisplayName!: string;

  @IsString()
  @Length(1, 253)
  @Matches(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/)
  hostname!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  url?: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  activeSeconds!: number;
}

export class WebsiteUsageSummaryBatchDto {
  @IsString()
  @IsNotEmpty()
  @Length(12, 128)
  deviceId!: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => WebsiteUsageSummaryDto)
  summaries!: WebsiteUsageSummaryDto[];
}

export class BrowserExtensionUsageBatchDto {
  @IsUUID('4')
  installationId!: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => WebsiteUsageSummaryDto)
  summaries!: WebsiteUsageSummaryDto[];
}
