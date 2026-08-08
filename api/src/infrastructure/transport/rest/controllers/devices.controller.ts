import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { DevicesService } from '@core/application/use-cases/devices.service';
import { AuthGuard } from '../guards/auth.guard';
import { RegisterDeviceDto, UpdateDeviceDto } from '../dto/devices.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';

import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Devices')
@UseGuards(AuthGuard)
@Controller(REST_ROUTES.devices)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @ApiOperation({ operationId: 'registerDevice' })
  @Post(REST_ROUTES.devicesRegister)
  register(@Req() req: AuthenticatedRequest, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(req.user.sub, dto);
  }

  @ApiOperation({ operationId: 'updateDevice' })
  @Patch(REST_ROUTES.deviceById)
  update(
    @Req() req: AuthenticatedRequest,
    @Param(ROUTE_PARAMS.deviceId) deviceId: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.devices.update(req.user.sub, deviceId, dto);
  }

  /**
   * Unregister device.
   *
   * @description Removes a registered device and invalidates its push token binding.
   * @why Prevents sending push notifications to logged-out or unlinked devices.
   * @when Called when user logs out of a specific device or revokes device access in settings.
   */
  @Delete(REST_ROUTES.deviceById)
  async delete(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deviceId) deviceId: string) {
    await this.devices.delete(req.user.sub, deviceId);
    return { ok: true };
  }
}
