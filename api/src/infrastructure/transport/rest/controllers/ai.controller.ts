import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { REST_ROUTES, ROUTE_PARAMS } from '@core/application/constants/app.constants';
import { AiService } from '@core/application/use-cases/ai.service';
import { AuthGuard } from '../guards/auth.guard';
import { AiRateLimitGuard } from '../guards/ai-rate-limit.guard';
import { AiCardSuggestionDto, AiSessionGradingDto } from '../dto/cards.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PERMISSIONS } from '@core/application/constants/permissions';
import { allowedResponseOrigin } from '../cors-origin';

@UseGuards(AuthGuard, PermissionsGuard, AiRateLimitGuard)
@RequirePermissions(PERMISSIONS.aiUse)
@Controller(REST_ROUTES.ai)
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * Request AI flashcard suggestions.
   *
   * @description Uses Gemini AI to parse input text/notes and generate flashcard suggestions.
   * @why Saves manual card creation time by automatically extracting Q&A cards from notes.
   * @when Called when the user clicks "Generate AI Flashcards" in the deck editor.
   */
  @Post(REST_ROUTES.cardSuggestions)
  suggestCards(@Req() req: AuthenticatedRequest, @Body() dto: AiCardSuggestionDto) {
    return this.ai.suggestCards(req.user.sub, dto.pastedText);
  }

  /**
   * Stream AI flashcard generation.
   *
   * @description Streams AI card generation output in real-time via Server-Sent Events (SSE).
   * @why Provides instant visual feedback while AI parses long study documents.
   * @when Called when requesting streaming AI card generation in the frontend.
   */
  @Post(`${REST_ROUTES.cardSuggestions}/stream`)
  async streamCards(@Req() req: AuthenticatedRequest, @Body() dto: AiCardSuggestionDto, @Res() res: FastifyReply) {
    const origin = allowedResponseOrigin(req.headers.origin);
    res.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    try {
      const stream = await this.ai.streamCards(req.user.sub, dto.pastedText);
      for await (const chunk of stream) {
        res.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.raw.end();
    }
  }

  /**
   * Enqueue background AI focus session feedback job.
   *
   * @description Triggers asynchronous AI analysis on a completed focus timer session.
   * @why Evaluates focus quality and generates constructive coaching feedback.
   * @when Called automatically upon completing a focus timer block.
   */
  @Post(REST_ROUTES.sessionFeedback)
  requestSessionFeedback(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.sessionId) sessionId: string) {
    return this.ai.requestSessionFeedback(req.user.sub, sessionId);
  }

  /**
   * Stream AI session summary.
   *
   * @description Streams AI session feedback summary via Server-Sent Events (SSE).
   * @why Displays live AI session coaching commentary as it is generated.
   * @when Called when viewing the focus session completion modal.
   */
  @Post('session-feedback/:sessionId/summary-stream')
  async streamSessionSummary(
    @Req() req: AuthenticatedRequest,
    @Param(ROUTE_PARAMS.sessionId) sessionId: string,
    @Res() res: FastifyReply,
  ) {
    const origin = allowedResponseOrigin(req.headers.origin);
    res.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    try {
      const stream = await this.ai.streamSessionSummary(req.user.sub, sessionId);
      for await (const chunk of stream) {
        res.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.raw.end();
    }
  }

  /**
   * Generate AI session grade and evaluation score.
   *
   * @description Calculates a numerical grade and performance evaluation for a focus session.
   * @why Quantifies user focus performance and awards session XP.
   * @when Called after completing session review and submitting summary notes.
   */
  @Post('session-feedback/:sessionId/grading')
  generateSessionGrading(
    @Req() req: AuthenticatedRequest,
    @Param(ROUTE_PARAMS.sessionId) sessionId: string,
    @Body() dto: AiSessionGradingDto,
  ) {
    return this.ai.generateSessionGrading(req.user.sub, sessionId, dto.summary);
  }

  /**
   * Get async AI job status.
   *
   * @description Queries the execution status and output of a background AI queue job.
   * @why Allows client polling for long-running background AI operations.
   * @when Polled by the frontend when an AI job ID is processing asynchronously.
   */
  @Get(REST_ROUTES.jobsById)
  getJob(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.jobId) jobId: string) {
    return this.ai.getJob(req.user.sub, jobId);
  }

  /**
   * Get AI session feedback results.
   *
   * @description Fetches saved AI feedback and coaching tips for a focus session.
   * @why Displays historic AI session advice when viewing past session history.
   * @when Called when inspecting a past focus session detail view.
   */
  @Get(REST_ROUTES.sessionFeedback)
  getSessionFeedback(@Req() req: AuthenticatedRequest, @Param(ROUTE_PARAMS.sessionId) sessionId: string) {
    return this.ai.getSessionFeedback(req.user.sub, sessionId);
  }
}
