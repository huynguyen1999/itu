import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { DashboardService } from '@core/application/use-cases/dashboard.service';
import { AuthGuard } from '../guards/auth.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.dashboard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * Get user productivity & study dashboard summary.
   *
   * @description Aggregates overall study stats, streak counter, total review counts, and active goals.
   * @why Provides high-level user metrics for the main home/dashboard screen.
   * @when Called upon navigating to the dashboard or home overview screen.
   */
  @Get(REST_ROUTES.summary)
  summary(@Req() req: AuthenticatedRequest) {
    return this.dashboard.summary(req.user.sub);
  }

  /**
   * Get study activity heat map calendar.
   *
   * @description Fetches daily study review activity over a given time range (e.g. past 30 or 365 days).
   * @why Renders a GitHub-style activity heat map for tracking study consistency.
   * @when Called when viewing user profile or progress calendar view.
   */
  @Get(REST_ROUTES.studyCalendar)
  studyCalendar(@Req() req: AuthenticatedRequest, @Query('days') days?: string) {
    return this.dashboard.studyCalendar(req.user.sub, days ? Number(days) : undefined);
  }

  /**
   * Get deck retention and learning statistics.
   *
   * @description Calculates mastery percentage, retention rate, and upcoming review breakdown for a deck.
   * @why Helps users analyze their learning efficiency and card retention per deck.
   * @when Called when opening the analytics/stats tab of a specific flashcard deck.
   */
  @Get(REST_ROUTES.deckStats)
  deckStats(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.deckId) deckId: string) {
    return this.dashboard.deckStats(req.user.sub, deckId);
  }
}
