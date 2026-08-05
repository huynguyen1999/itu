import { Body, Controller, Delete, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { IDevicesUseCase } from '@core/application/ports/in/devices-use-case.port';
import { AuthGuard } from '../guards/auth.guard';
import { RegisterDeviceDto, UpdateDeviceDto } from '../dto/devices.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.devices)
export class DevicesController {
  constructor(@Inject(TOKENS.DEVICES_USE_CASE) private readonly devices: IDevicesUseCase) {}

  /**
   * Register push notification token & device.
   *
   * @description Registers or links a device push token (APNS / WebPush) and device metadata to the active user profile.
   * @why Enables sending push notifications and syncing across registered user devices.
   * @when Called after the user approves push notification permissions upon logging in or installing the client.
   */
  @Post(REST_ROUTES.devicesRegister)
  register(@Req() req: AuthenticatedRequest, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(req.user.sub, dto);
  }

  /**
   * Update device information or push token.
   *
   * @description Updates registered device details such as name, push token, or device settings.
   * @why Keeps push tokens valid when refreshed by the platform OS (iOS/Android/Web).
   * @when Called when the client SDK detects an updated push token or device setting change.
   */
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
