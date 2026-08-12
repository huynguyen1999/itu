import { IsBoolean, IsISO8601, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CalendarTimelineQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}

export class CreateIcsCalendarDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;
}

export class UpdateExternalCalendarDto {
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsString() @MaxLength(30) color?: string;
}
