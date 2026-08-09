import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsObject } from 'class-validator';
import { JournalEntryKind } from '@core/domain/enums';

export class CreateJournalEntryDto {
  @IsString()
  id!: string;

  @IsEnum(JournalEntryKind)
  kind!: JournalEntryKind;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  contentMarkdown?: string;

  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsObject()
  weeklyReview?: {
    periodStart: string;
    periodEnd: string;
    summarySnapshot: Record<string, unknown>;
    wentWellMarkdown?: string | null;
    frictionMarkdown?: string | null;
    nextWeekMarkdown?: string | null;
    experimentSnapshot?: Record<string, unknown> | null;
  };

}

export class UpdateJournalEntryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  contentMarkdown?: string;

  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsObject()
  weeklyReview?: {
    periodStart?: string;
    periodEnd?: string;
    summarySnapshot?: Record<string, unknown>;
    wentWellMarkdown?: string | null;
    frictionMarkdown?: string | null;
    nextWeekMarkdown?: string | null;
    experimentSnapshot?: Record<string, unknown> | null;
  };

}

export class CreateJournalTemplateDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name!: string;

  @IsEnum(JournalEntryKind)
  entryKind!: JournalEntryKind;

  @IsOptional()
  @IsString()
  titleTemplate?: string;

  @IsOptional()
  @IsString()
  bodyMarkdown?: string;

  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  builtIn?: boolean;
}

export class UpdateJournalTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(JournalEntryKind)
  entryKind?: JournalEntryKind;

  @IsOptional()
  @IsString()
  titleTemplate?: string;

  @IsOptional()
  @IsString()
  bodyMarkdown?: string;

  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;
}

export class CreateJournalTagDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class SearchJournalQueryDto {
  @IsOptional()
  @IsEnum(JournalEntryKind)
  kind?: JournalEntryKind;

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  includeDeleted?: string;
}

export class WeeklySummaryQueryDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}
