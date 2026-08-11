import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExerciseDto {
  @ApiProperty({ description: 'Exercise name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Description or execution notes' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION'], default: 'WEIGHT_REPS' })
  @IsOptional()
  @IsEnum(['WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION'])
  metricType?: 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';

  @ApiPropertyOptional({ description: 'Equipment required' })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiPropertyOptional({ description: 'Primary muscle group' })
  @IsOptional()
  @IsString()
  primaryMuscleGroup?: string;

  @ApiPropertyOptional({ description: 'Secondary muscle groups', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryMuscleGroups?: string[];

  @ApiPropertyOptional({ enum: ['KG', 'LBS'], default: 'KG' })
  @IsOptional()
  @IsEnum(['KG', 'LBS'])
  defaultWeightUnit?: 'KG' | 'LBS';

  @ApiPropertyOptional({ description: 'Default rest in seconds' })
  @IsOptional()
  @IsNumber()
  defaultRestSeconds?: number;
}

export class UpdateExerciseDto {
  @ApiPropertyOptional({ description: 'Exercise name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Description or execution notes' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION'] })
  @IsOptional()
  @IsEnum(['WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION'])
  metricType?: 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';

  @ApiPropertyOptional({ description: 'Equipment required' })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiPropertyOptional({ description: 'Primary muscle group' })
  @IsOptional()
  @IsString()
  primaryMuscleGroup?: string;

  @ApiPropertyOptional({ description: 'Secondary muscle groups', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryMuscleGroups?: string[];

  @ApiPropertyOptional({ enum: ['KG', 'LBS'] })
  @IsOptional()
  @IsEnum(['KG', 'LBS'])
  defaultWeightUnit?: 'KG' | 'LBS';

  @ApiPropertyOptional({ description: 'Default rest in seconds' })
  @IsOptional()
  @IsNumber()
  defaultRestSeconds?: number;
}

export class CreateWorkoutDto {
  @ApiPropertyOptional({ description: 'Client-generated workout ID (ULID)' })
  @IsOptional()
  @IsString()
  id?: string;
  @ApiPropertyOptional({ description: 'Workout title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Workout exercises', type: [Object] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkoutExerciseDto)
  exercises?: UpdateWorkoutExerciseDto[];
}

export class UpdateWorkoutSetDto {
  @ApiPropertyOptional({ description: 'Set ID' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Sort order index' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['WARM_UP', 'WARMUP', 'NORMAL', 'DROP', 'FAILURE'] })
  @IsOptional()
  @IsEnum(['WARM_UP', 'WARMUP', 'NORMAL', 'DROP', 'FAILURE'])
  type?: 'WARM_UP' | 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';

  @ApiPropertyOptional({ description: 'Reps count' })
  @IsOptional()
  @IsNumber()
  reps?: number;

  @ApiPropertyOptional({ description: 'Weight value' })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'Distance in meters' })
  @IsOptional()
  @IsNumber()
  distanceMeters?: number;

  @ApiPropertyOptional({ description: 'Rate of Perceived Exertion (RPE 1-10)' })
  @IsOptional()
  @IsNumber()
  rpe?: number;

  @ApiPropertyOptional({ description: 'ISO date string when this set was completed', type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  completedAt?: string | null;
}

/** Stable response shape for dated exercise history. */
export class ExerciseStatsSetDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workoutExerciseId!: string;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: ['WARM_UP', 'WARMUP', 'NORMAL', 'DROP', 'FAILURE'] })
  type!: 'WARM_UP' | 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';

  @ApiPropertyOptional({ nullable: true, type: Number })
  reps?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  weight?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  durationSeconds?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  distanceMeters?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  rpe?: number | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  completedAt?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  performedAt?: string | null;

  @ApiPropertyOptional()
  workoutId?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  workoutTitle?: string | null;

  @ApiPropertyOptional()
  version?: number;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  deletedAt?: string | null;
}

export class ExerciseStatsResponseDto {
  @ApiPropertyOptional({ nullable: true, type: Number })
  heaviestWeight!: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  bestVolumeSet!: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  estimated1RM!: number | null;

  @ApiProperty()
  totalSets!: number;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  lastPerformedAt!: string | null;

  @ApiProperty({ type: [ExerciseStatsSetDto] })
  recentSets!: ExerciseStatsSetDto[];
}

export class UpdateWorkoutExerciseDto {
  @ApiPropertyOptional({ description: 'Workout exercise ID' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Exercise definition ID' })
  @IsString()
  exerciseId!: string;

  @ApiPropertyOptional({ description: 'Sort order index' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Exercise note' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Rest time in seconds' })
  @IsOptional()
  @IsNumber()
  restSeconds?: number;

  @ApiPropertyOptional({ description: 'Workout sets', type: [UpdateWorkoutSetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkoutSetDto)
  sets?: UpdateWorkoutSetDto[];
}

export class UpdateWorkoutDto {
  @ApiPropertyOptional({ description: 'Workout title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'ISO date string of start time' })
  @IsOptional()
  @IsString()
  startedAt?: string;

  @ApiPropertyOptional({ description: 'ISO date string of end time' })
  @IsOptional()
  @IsString()
  endedAt?: string;

  @ApiPropertyOptional({ description: 'Duration in minutes' })
  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Workout exercises', type: [UpdateWorkoutExerciseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkoutExerciseDto)
  exercises?: UpdateWorkoutExerciseDto[];
}
