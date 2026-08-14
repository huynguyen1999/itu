import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FocusMode,
  FocusPhase,
  HabitDirection,
  HabitProgressSource,
  HabitScheduleType,
  HabitTargetType,
  HabitTaskSyncPolicy,
  CommitmentPolicyLevel,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';

import { PartialType } from '@nestjs/swagger';

export class CreateTaskListDto {
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(30) color?: string;
}

export class UpdateTaskListDto extends PartialType(CreateTaskListDto) {
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class CreateTagDto {
  @IsString() @MinLength(1) @MaxLength(50) name!: string;
  @IsOptional() @IsString() @MaxLength(30) color?: string;
}

export class CreateTaskSectionDto {
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsOptional() @IsString() taskListId?: string | null;
  @IsOptional() @IsString() projectId?: string | null;
}

export class UpdateTaskSectionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) title?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) descriptionMarkdown?: string;
  @IsOptional() @IsString() taskListId?: string | null;
  @IsOptional() @IsString() projectId?: string | null;
  @IsOptional() @IsString() sectionId?: string | null;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsBoolean() important?: boolean;
  @IsOptional() @IsBoolean() urgentOverride?: boolean | null;
  @IsOptional() @IsDateString() scheduledStartAt?: string;
  @IsOptional() @IsDateString() scheduledEndAt?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) estimatedMinutes?: number;
  @IsOptional() @IsString() @MaxLength(200) recurrenceRule?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tagIds?: string[];
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class TaskQueryDto {
  @IsOptional() @IsString() view?: 'today' | 'upcoming' | 'inbox' | 'all';
  @IsOptional() @IsString() taskListId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() tagId?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ReorderTasksDto {
  @IsArray() @ArrayMaxSize(250) @IsString({ each: true }) taskIds!: string[];
}

export class CreateReminderDto {
  @IsOptional() @IsDateString() remindAt?: string;
  @IsOptional() @IsEnum(['ABSOLUTE', 'RELATIVE']) type?: 'ABSOLUTE' | 'RELATIVE';
  @IsOptional() @IsEnum(['DUE_AT', 'SCHEDULE_START_AT']) relativeTo?: 'DUE_AT' | 'SCHEDULE_START_AT';
  @IsOptional() @IsInt() @Min(-100000) @Max(100000) offsetMinutes?: number;
  @IsOptional() @IsInt() @Min(-3650) @Max(3650) calendarDayOffset?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) timeOfDayMinutes?: number;
  @IsOptional() @IsString() @MaxLength(80) timeZone?: string;
  @IsOptional() @IsBoolean() persistent?: boolean;
}

export class UpdateReminderDto {
  @IsDateString() remindAt!: string;
}

export class SnoozeReminderDto {
  @IsDateString() remindAt!: string;
}

export class CreateFocusPresetDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsInt() @Min(1) @Max(240) workMinutes!: number;
  @IsInt() @Min(1) @Max(120) shortBreakMinutes!: number;
  @IsInt() @Min(1) @Max(240) longBreakMinutes!: number;
  @IsInt() @Min(1) @Max(20) cyclesBeforeLong!: number;
  @IsOptional() @IsBoolean() autoStartBreaks?: boolean;
  @IsOptional() @IsBoolean() autoStartWork?: boolean;
}

export class StartFocusDto {
  @IsOptional() @IsString() taskId?: string;
  @IsOptional() @IsString() @MaxLength(200) customTitle?: string;
  @IsEnum(FocusMode) mode!: FocusMode;
  @IsOptional() @IsEnum(FocusPhase) phase?: FocusPhase;
  @IsOptional() @IsString() presetId?: string;
  @IsOptional() @IsString() policyId?: string;
  @IsOptional() @IsString() ownerDeviceId?: string;
  @IsOptional() @IsInt() @Min(60) @Max(86400) plannedSeconds?: number;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey?: string;
}

export class FocusActionDto {
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(50) category?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsInt() @Min(1) @Max(86400) extendSeconds?: number;
  @IsOptional() @IsString() ownerDeviceId?: string;
  @IsOptional() @IsString() @MaxLength(2000) reflection?: string;
  @IsOptional() @IsString() taskId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) customTitle?: string;
}

export class AdjustFocusDto {
  @IsDateString() startedAt!: string;
  @IsDateString() completedAt!: string;
  @IsOptional() @IsString() taskId?: string | null;
  @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey?: string;
}

export class HabitChecklistItemDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsOptional() @IsBoolean() required?: boolean;
}

export class HabitTaskTemplateDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) descriptionMarkdown?: string;
  @IsOptional() @IsString() projectId?: string | null;
  @IsOptional() @IsString() sectionId?: string | null;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsInt() @Min(1) @Max(100000) estimatedMinutes?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tagIds?: string[];
  @IsOptional() @IsEnum(HabitTaskSyncPolicy) syncPolicy?: HabitTaskSyncPolicy;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class CreateHabitDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(30) color?: string;
  @IsEnum(HabitTargetType) targetType!: HabitTargetType;
  @Type(() => Number) @IsNumber() @Min(0.0001) targetValue!: number;
  @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @IsOptional() @IsEnum(HabitDirection) direction?: HabitDirection;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsString() timeBlockId?: string | null;
  @IsEnum(HabitScheduleType) scheduleType!: HabitScheduleType;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) weekdays?: number[];
  @IsOptional() @IsInt() @Min(1) @Max(365) intervalDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) timesPerPeriod?: number;
  @IsOptional() @IsString() period?: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @IsOptional() @IsInt() @Min(0) @Max(30) allowedSkips?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) restDays?: number[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) tagIds?: string[];
  @IsOptional() @IsString() taskTemplateId?: string;
  @IsOptional() @IsString() focusPresetId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) reminderTimes?: string[];
  @IsOptional() @ValidateNested() @Type(() => HabitTaskTemplateDto) taskTemplate?: HabitTaskTemplateDto;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => HabitChecklistItemDto)
  checklistItems?: HabitChecklistItemDto[];
}

export class UpdateHabitDto extends PartialType(CreateHabitDto) {
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class HabitRangeDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

export class HabitCheckInDto {
  @Type(() => Number) @IsNumber() @Min(0) value!: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsString() focusSessionId?: string;
  @IsOptional() @IsBoolean() adjusted?: boolean;
  @IsOptional() @IsEnum(HabitProgressSource) source?: HabitProgressSource;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string;
}

export class HabitOccurrenceActionDto {
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) idempotencyKey?: string;
}

export class UpsertHabitCommitmentPolicyDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsEnum(CommitmentPolicyLevel) level!: CommitmentPolicyLevel;
  @IsInt() @Min(1) @Max(100000) expectedAccountXp!: number;
  @IsInt() @Min(0) @Max(10080) graceMinutes!: number;
  @IsInt() @Min(0) @Max(14400) recoveryWindowMinutes!: number;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
}

export class HabitChecklistActionDto {
  @IsBoolean() completed!: boolean;
}

export class CreateHabitTimeBlockDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(30) color?: string;
  @IsString() @MaxLength(5) startLocal!: string;
  @IsString() @MaxLength(5) endLocal!: string;
}
