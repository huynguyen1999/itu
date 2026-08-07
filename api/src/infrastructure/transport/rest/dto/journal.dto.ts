import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsObject } from 'class-validator';
import { ExpenseCategory, JournalEntryKind, PaymentMethod } from '@core/domain/enums';

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
  };

  @IsOptional()
  @IsObject()
  expense?: {
    amount: number | string;
    currency?: string;
    category?: ExpenseCategory;
    merchant?: string;
    paymentMethod?: PaymentMethod;
    transactionAt?: string;
  };

  @IsOptional()
  @IsObject()
  workout?: {
    startedAt?: string;
    durationMinutes?: number;
    exercises: {
      id?: string;
      exerciseId: string;
      sortOrder?: number;
      note?: string;
      sets: {
        id?: string;
        sortOrder?: number;
        reps: number;
        weight: number;
      }[];
    }[];
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
  };

  @IsOptional()
  @IsObject()
  expense?: {
    amount?: number | string;
    currency?: string;
    category?: ExpenseCategory;
    merchant?: string;
    paymentMethod?: PaymentMethod;
    transactionAt?: string;
  };

  @IsOptional()
  @IsObject()
  workout?: {
    startedAt?: string;
    durationMinutes?: number;
    exercises?: {
      id?: string;
      exerciseId: string;
      sortOrder?: number;
      note?: string;
      sets: {
        id?: string;
        sortOrder?: number;
        reps: number;
        weight: number;
      }[];
    }[];
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
  currency?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  query?: string;
}

export class WeeklySummaryQueryDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}

export class CreateExerciseDefinitionDto {
  @IsString()
  name!: string;
}

