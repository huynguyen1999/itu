import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExerciseDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION'])
  metricType?: 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';

  @IsOptional()
  @IsString()
  equipment?: string;

  @IsOptional()
  @IsString()
  primaryMuscleGroup?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryMuscleGroups?: string[];

  @IsOptional()
  @IsEnum(['KG', 'LBS'])
  defaultWeightUnit?: 'KG' | 'LBS';

  @IsOptional()
  @IsNumber()
  defaultRestSeconds?: number;
}

export class UpdateExerciseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION'])
  metricType?: 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';

  @IsOptional()
  @IsString()
  equipment?: string;

  @IsOptional()
  @IsString()
  primaryMuscleGroup?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryMuscleGroups?: string[];

  @IsOptional()
  @IsEnum(['KG', 'LBS'])
  defaultWeightUnit?: 'KG' | 'LBS';

  @IsOptional()
  @IsNumber()
  defaultRestSeconds?: number;
}

export class CreateWorkoutDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  startedAt?: string;
}

export class UpdateWorkoutSetDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(['WARMUP', 'NORMAL', 'DROP', 'FAILURE'])
  type?: 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';

  @IsOptional()
  @IsNumber()
  reps?: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  durationSeconds?: number;

  @IsOptional()
  @IsNumber()
  distanceMeters?: number;

  @IsOptional()
  @IsNumber()
  rpe?: number;
}

export class UpdateWorkoutExerciseDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  exerciseId!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  restSeconds?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkoutSetDto)
  sets?: UpdateWorkoutSetDto[];
}

export class UpdateWorkoutDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  endedAt?: string;

  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(['ACTIVE', 'COMPLETED', 'ABANDONED'])
  status?: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkoutExerciseDto)
  exercises?: UpdateWorkoutExerciseDto[];
}
