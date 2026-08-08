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
} from '@core/application/use-cases/preferences.service';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

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

  @ApiOperation({ operationId: 'updateGymPreferences' })
  @Patch('gym')
  updateGymPreferences(@Req() req: AuthenticatedRequest, @Body() patch: Partial<GymPreferences>) {
    return this.preferencesService.updateGymPreferences(req.user.sub, patch);
  }
}
