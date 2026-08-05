import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ReviewDirection, ReviewGrade, StudyMode } from '@core/domain/enums';

export class StartSessionDto {
  @IsOptional()
  @IsString()
  deckId?: string;

  @IsEnum(StudyMode)
  mode!: StudyMode;
}

export class SubmitReviewDto {
  @IsString()
  cardId!: string;

  @IsEnum(ReviewDirection)
  direction!: ReviewDirection;

  @IsEnum(ReviewGrade)
  grade!: ReviewGrade;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  userAnswer?: string;

  @IsOptional()
  @IsInt()
  responseMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class CompleteSessionDto {
  @IsInt()
  @Min(1)
  @Max(10)
  rating!: number;
}
