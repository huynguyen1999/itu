import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { CalendarService } from '@core/application/use-cases/calendar.service';
import { CalendarSyncService } from '@core/application/use-cases/calendar-sync.service';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { CalendarTimelineQueryDto, CreateIcsCalendarDto, UpdateExternalCalendarDto } from '../dto/calendar.dto';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly sync: CalendarSyncService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('timeline')
  timeline(@Req() req: AuthenticatedRequest, @Query() query: CalendarTimelineQueryDto) {
    return this.calendar.timeline(req.user.sub, query.from, query.to);
  }

  @UseGuards(AuthGuard)
  @Get('sources')
  sources(@Req() req: AuthenticatedRequest) { return this.sync.list(req.user.sub); }

  @UseGuards(AuthGuard)
  @Post('sources/ics')
  createIcs(@Req() req: AuthenticatedRequest, @Body() dto: CreateIcsCalendarDto) {
    return this.sync.createIcs(req.user.sub, dto.url, dto.name);
  }

  @UseGuards(AuthGuard)
  @Post('sources/:id/refresh')
  refresh(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sync.refresh(req.user.sub, id);
  }

  @UseGuards(AuthGuard)
  @Patch('sources/:id')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateExternalCalendarDto) {
    return this.sync.update(req.user.sub, id, dto);
  }

  @UseGuards(AuthGuard)
  @Delete('sources/:id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sync.remove(req.user.sub, id);
  }

  @UseGuards(AuthGuard)
  @Get('google/connect')
  connectGoogle(@Req() req: AuthenticatedRequest) { return { url: this.sync.googleConnectUrl(req.user.sub) }; }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() reply: FastifyReply) {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    try {
      await this.sync.googleCallback(code, state);
      return reply.redirect(`${webOrigin}/calendar?google=connected`);
    } catch {
      return reply.redirect(`${webOrigin}/calendar?google=error`);
    }
  }

  @Post('google/webhook')
  @HttpCode(204)
  googleWebhook(@Req() req: { headers?: Record<string, string | undefined> }) {
    void this.sync.handleGoogleWebhook(req.headers?.['x-goog-channel-id']);
  }
}
