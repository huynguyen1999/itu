import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  engagedSeconds?: number;
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

export class WebsiteUsageQueryDto extends UsageDateQueryDto {
  @IsOptional()
  @IsString()
  includeUrlDetails?: string;
}

export class WebsiteUrlQueryDto extends UsageDateQueryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 253)
  hostname!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
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

export class WebsiteActivitySessionDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  id!: string;

  @IsDateString()
  startedAt!: string;

  @IsDateString()
  endedAt!: string;

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

  @IsString()
  @Length(1, 2048)
  url!: string;

  @IsOptional()
  @IsString()
  iconUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 512)
  pageTitle?: string | null;

  @IsBoolean()
  isPrivate!: boolean;

  @IsString()
  @Length(1, 100)
  timezone!: string;
}

export class WebsiteActivitySessionBatchDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  installationId!: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => WebsiteActivitySessionDto)
  sessions!: WebsiteActivitySessionDto[];
}
