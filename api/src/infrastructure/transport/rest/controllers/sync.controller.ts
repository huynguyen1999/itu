import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES } from '@core/application/constants/app.constants';
import { SyncService } from '@core/application/use-cases/sync.service';
import { AuthGuard } from '../guards/auth.guard';
import { PullSyncChangesDto, PushSyncMutationsDto, SyncRequestDto } from '../dto/sync.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.sync)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /**
   * Synchronize offline mutations and pull incremental changes.
   *
   * @description Processes queued offline mutations from the frontend and returns all server-side changes since the provided cursor.
   * @why Allows bidirectional, offline-first sync and keeps multi-device state consistent.
   * @when Called upon re-establishing connection after being offline, periodically during active sessions, or immediately after local offline actions.
   */
  @Post()
  synchronize(@Req() request: AuthenticatedRequest, @Body() dto: SyncRequestDto) {
    return this.sync.synchronize(request.user.sub, dto.deviceId, dto.clientInstanceId, dto.cursor, dto.mutations);
  }

  @Post('mutations')
  pushMutations(@Req() request: AuthenticatedRequest, @Body() dto: PushSyncMutationsDto) {
    return this.sync.pushMutations(request.user.sub, dto.deviceId, dto.clientInstanceId, dto.mutations);
  }

  @Get('changes')
  pullChanges(@Req() request: AuthenticatedRequest, @Query() dto: PullSyncChangesDto) {
    return this.sync.pullChanges(request.user.sub, dto.deviceId, dto.cursor);
  }
}
