import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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
  @ApiPropertyOptional({ description: 'Workout title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'ISO date string of start time' })
  @IsOptional()
  @IsString()
  startedAt?: string;

  @ApiPropertyOptional({ enum: ['IN_PROGRESS', 'ACTIVE', 'COMPLETED'], default: 'IN_PROGRESS' })
  @IsOptional()
  @IsEnum(['IN_PROGRESS', 'ACTIVE', 'COMPLETED'])
  status?: 'IN_PROGRESS' | 'ACTIVE' | 'COMPLETED';

  @ApiPropertyOptional({ description: 'ISO date string of end time' })
  @IsOptional()
  @IsString()
  endedAt?: string;

  @ApiPropertyOptional({ description: 'Duration in minutes' })
  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

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

  @ApiPropertyOptional({ enum: ['WARMUP', 'NORMAL', 'DROP', 'FAILURE'] })
  @IsOptional()
  @IsEnum(['WARMUP', 'NORMAL', 'DROP', 'FAILURE'])
  type?: 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';

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

  @ApiPropertyOptional({ enum: ['IN_PROGRESS', 'ACTIVE', 'COMPLETED'] })
  @IsOptional()
  @IsEnum(['IN_PROGRESS', 'ACTIVE', 'COMPLETED'])
  status?: 'IN_PROGRESS' | 'ACTIVE' | 'COMPLETED';

  @ApiPropertyOptional({ description: 'Workout exercises', type: [UpdateWorkoutExerciseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkoutExerciseDto)
  exercises?: UpdateWorkoutExerciseDto[];
}
