import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { QUERY_PARAMS, REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { StudyService } from '@core/application/use-cases/study.service';
import { AuthGuard } from '../guards/auth.guard';
import { CompleteSessionDto, StartSessionDto, SubmitReviewDto } from '../dto/study.dto';
import { CursorPageQueryDto } from '../dto/pagination.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.study)
export class StudyController {
  constructor(private readonly study: StudyService) {}

  /**
   * Get due review flashcards.
   *
   * @description Fetches cards due for spaced repetition review based on FSRS interval calculations.
   * @why Determines which cards the user needs to study today.
   * @when Called when loading the study review screen or checking review counts.
   */
  @Get(REST_ROUTES.due)
  due(@Req() req: AuthenticatedRequest, @Query(QUERY_PARAMS.deckId) deckId?: string) {
    return this.study.due(req.user.sub, deckId);
  }

  /**
   * Get study session history.
   *
   * @description Fetches a paginated history of past study sessions.
   * @why Displays historic study logs and review counts in performance history.
   * @when Called when opening study history or analytics view.
   */
  @Get(REST_ROUTES.sessions)
  history(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.study.history(req.user.sub, query);
  }

  /**
   * Start flashcard study session.
   *
   * @description Initializes a new study session for a specified deck or set of due cards.
   * @why Creates a session context to track card reviews, duration, and score.
   * @when Called when tapping "Start Study Session" button.
   */
  @Post(REST_ROUTES.sessions)
  start(@Req() req: AuthenticatedRequest, @Body() dto: StartSessionDto) {
    return this.study.start(req.user.sub, dto);
  }

  /**
   * Submit flashcard review rating.
   *
   * @description Submits rating grade (Again, Hard, Good, Easy) for a reviewed flashcard.
   * @why Updates the Spaced Repetition (FSRS) scheduling matrix for the reviewed card.
   * @when Called after flipping a flashcard and selecting a rating button.
   */
  @Post(REST_ROUTES.sessionReviews)
  review(
    @Req() req: AuthenticatedRequest,
    @Param(ROUTE_PARAMS.sessionId) sessionId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.study.submitReview(req.user.sub, sessionId, dto);
  }

  /**
   * Complete study session.
   *
   * @description Finalizes a study session, updates streak stats, and records total review time.
   * @why Wraps up active session tracking and awards daily XP/streak completion.
   * @when Called when finishing the last card in a study deck or exiting a study session.
   */
  @Post(REST_ROUTES.sessionComplete)
  complete(
    @Req() req: AuthenticatedRequest,
    @Param(ROUTE_PARAMS.sessionId) sessionId: string,
    @Body() dto: CompleteSessionDto,
  ) {
    return this.study.complete(req.user.sub, sessionId, dto);
  }

  /**
   * Get study session detail.
   *
   * @description Fetches breakdown details and card review logs for a specific study session.
   * @why Shows end-of-session summary results (cards remembered vs forgotten).
   * @when Called when viewing the session summary screen after completing a review run.
   */
  @Get('sessions/:sessionId')
  sessionDetails(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.sessionId) sessionId: string) {
    return this.study.sessionDetails(req.user.sub, sessionId);
  }
}
