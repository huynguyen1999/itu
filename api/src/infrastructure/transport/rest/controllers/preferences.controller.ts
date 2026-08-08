import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES } from '@core/application/constants/app.constants';
import { PreferencesService, type MoneyPreferences, type GymPreferences } from '@core/application/use-cases/preferences.service';
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
