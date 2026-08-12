import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import {
  PreferencesService,
  type TaskPreferences,
  type FocusPreferences,
  type HabitPreferences,
  type MatrixPreferences,
  type GrowthPreferences,
  type LearnPreferences,
  type JournalPreferences,
  type MoneyPreferences,
  type GymPreferences,
  type UsagePreferences,
  type CalendarPreferences,
  type CalendarTimelineKind,
} from '@core/application/use-cases/preferences.service';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import {
  MAX_EXCLUDED_BUNDLE_IDS,
  MAX_EXCLUDED_BUNDLE_ID_LENGTH,
} from '@core/application/use-cases/preferences.service';

export class UpdateUsagePreferencesDto implements Partial<UsagePreferences> {
  @ApiPropertyOptional({ description: 'Enable foreground application tracking' })
  @IsOptional()
  @IsBoolean()
  trackingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable browser website tracking' })
  @IsOptional()
  @IsBoolean()
  websiteTrackingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Number of days to retain usage summaries', type: 'integer', minimum: 7, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  retentionDays?: number;

  @ApiPropertyOptional({
    description: 'Idle threshold in seconds before an app is no longer engaged',
    type: 'integer',
    minimum: 60,
    maximum: 1800,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(1800)
  idleThresholdSeconds?: number;

  @ApiPropertyOptional({
    description: 'Bundle identifiers excluded from foreground usage tracking',
    type: 'array',
    maxItems: MAX_EXCLUDED_BUNDLE_IDS,
    items: { type: 'string', minLength: 1, maxLength: MAX_EXCLUDED_BUNDLE_ID_LENGTH },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EXCLUDED_BUNDLE_IDS)
  @IsString({ each: true })
  @Length(1, MAX_EXCLUDED_BUNDLE_ID_LENGTH, { each: true })
  excludedBundleIds?: string[];
}

const CALENDAR_KINDS: CalendarTimelineKind[] = ['TASK_DURATION', 'TASK_DUE', 'FOCUS_SESSION', 'EXTERNAL_EVENT'];

export class UpdateCalendarPreferencesDto implements Partial<CalendarPreferences> {
  @IsOptional()
  @IsEnum(['DAY', 'WEEK', 'MONTH'])
  zoom?: CalendarPreferences['zoom'];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(CALENDAR_KINDS.length)
  @IsEnum(CALENDAR_KINDS, { each: true })
  visibleKinds?: CalendarTimelineKind[];

  @IsOptional()
  @IsBoolean()
  showCompleted?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  collapsedGroupIds?: string[];
}

@ApiTags('Preferences')
@UseGuards(AuthGuard)
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @ApiOperation({ operationId: 'getPreferences' })
  @Get()
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.preferencesService.getPreferences(req.user.sub);
  }

  @ApiOperation({ operationId: 'updateTaskPreferences' })
  @Patch('tasks')
  updateTaskPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<TaskPreferences>) {
    return this.preferencesService.updateTaskPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateFocusPreferences' })
  @Patch('focus')
  updateFocusPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<FocusPreferences>) {
    return this.preferencesService.updateFocusPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateHabitPreferences' })
  @Patch('habits')
  updateHabitPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<HabitPreferences>) {
    return this.preferencesService.updateHabitPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateMatrixPreferences' })
  @Patch('matrix')
  updateMatrixPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<MatrixPreferences>) {
    return this.preferencesService.updateMatrixPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateGrowthPreferences' })
  @Patch('growth')
  updateGrowthPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<GrowthPreferences>) {
    return this.preferencesService.updateGrowthPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateLearnPreferences' })
  @Patch('learn')
  updateLearnPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<LearnPreferences>) {
    return this.preferencesService.updateLearnPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateJournalPreferences' })
  @Patch('journal')
  updateJournalPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<JournalPreferences>) {
    return this.preferencesService.updateJournalPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateMoneyPreferences' })
  @Patch('money')
  updateMoneyPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<MoneyPreferences>) {
    return this.preferencesService.updateMoneyPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateBudgetPreferences' })
  @Patch('budget')
  updateBudgetPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<MoneyPreferences>) {
    return this.preferencesService.updateBudgetPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateGymPreferences' })
  @Patch('gym')
  updateGymPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<GymPreferences>) {
    return this.preferencesService.updateGymPreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'updateUsagePreferences' })
  @Patch('usage')
  updateUsagePreferences(@Req() req: AuthenticatedRequest, @Body() patch: UpdateUsagePreferencesDto) {
    return this.preferencesService.updateUsagePreferences(req.user.sub, patch);
  }

  @ApiOperation({ operationId: 'getCalendarPreferences' })
  @Get('calendar')
  getCalendarPreferences(@Req() req: AuthenticatedRequest) {
    return this.preferencesService.getCalendarPreferences(req.user.sub);
  }

  @ApiOperation({ operationId: 'updateCalendarPreferences' })
  @Patch('calendar')
  updateCalendarPreferences(@Req() req: AuthenticatedRequest, @Body() patch: UpdateCalendarPreferencesDto) {
    return this.preferencesService.updateCalendarPreferences(req.user.sub, patch);
  }
}
