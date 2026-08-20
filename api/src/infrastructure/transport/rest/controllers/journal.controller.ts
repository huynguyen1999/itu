import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { REST_ROUTES } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import { JournalService } from '@core/application/use-cases/journal/journal.service';
import { ReviewInsightsService } from '@core/application/use-cases/review-insights.service';
import { AuthGuard } from '../guards/auth.guard';
import {
  CreateJournalEntryDto,
  CreateJournalTagDto,
  CreateJournalTemplateDto,
  SearchJournalQueryDto,
  UpdateJournalEntryDto,
  UpdateJournalTemplateDto,
  WeeklySummaryQueryDto,
  DailySummaryQueryDto,
} from '../dto/journal.dto';
import type { AuthenticatedMultipartRequest, AuthenticatedRequest } from '../types/authenticated-request';
import { createUlid } from '@core/application/ulid';
import type { FastifyReply } from 'fastify';
import { hcmcDateOnly } from '@core/application/utils/calendar';

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.journal)
export class JournalController {
  constructor(
    private readonly journalService: JournalService,
    private readonly reviewInsightsService: ReviewInsightsService,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly mediaStorage: IMediaStorage,
  ) {}

  @Get('entries')
  listEntries(@Req() req: AuthenticatedRequest, @Query() query: SearchJournalQueryDto) {
    return this.journalService.listEntries(req.user.sub, {
      kind: query.kind,
      tagId: query.tagId,
      contextType: query.contextType,
      contextId: query.contextId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      query: query.query,
      includeDeleted: query.includeDeleted === 'true',
    });
  }

  @Get('entries/:id')
  getEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.journalService.getEntry(req.user.sub, id);
  }

  @Post('entries/:id/ai-insights')
  generateAiInsights(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reviewInsightsService.generate(req.user.sub, id);
  }

  @Post('entries')
  createEntry(@Req() req: AuthenticatedRequest, @Body() dto: CreateJournalEntryDto) {
    return this.journalService.createEntry(req.user.sub, {
      ...dto,
      entryDate: new Date(dto.entryDate),
      weeklyReview: dto.weeklyReview
        ? {
            ...dto.weeklyReview,
            periodStart: new Date(dto.weeklyReview.periodStart),
            periodEnd: new Date(dto.weeklyReview.periodEnd),
          }
        : undefined,
      dailyReview: dto.dailyReview
        ? {
            ...dto.dailyReview,
            periodDate: new Date(dto.dailyReview.periodDate),
          }
        : undefined,
    });
  }

  @Patch('entries/:id')
  updateEntry(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.journalService.updateEntry(req.user.sub, id, {
      ...dto,
      entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
      weeklyReview: dto.weeklyReview
        ? {
            ...dto.weeklyReview,
            periodStart: dto.weeklyReview.periodStart ? new Date(dto.weeklyReview.periodStart) : undefined,
            periodEnd: dto.weeklyReview.periodEnd ? new Date(dto.weeklyReview.periodEnd) : undefined,
          }
        : undefined,
      dailyReview: dto.dailyReview
        ? {
            ...dto.dailyReview,
            periodDate: dto.dailyReview.periodDate ? new Date(dto.dailyReview.periodDate) : undefined,
          }
        : undefined,
    });
  }

  @Delete('entries/:id')
  deleteEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.journalService.softDeleteEntry(req.user.sub, id);
  }

  @Post('entries/:id/restore')
  restoreEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.journalService.restoreEntry(req.user.sub, id);
  }

  @Get('entries/:id/revisions')
  listRevisions(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.journalService.listRevisions(req.user.sub, id);
  }

  @Post('entries/:id/revisions/:revisionId/restore')
  restoreRevision(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.journalService.restoreRevision(req.user.sub, id, revisionId);
  }

  @Get('templates')
  listTemplates(@Req() req: AuthenticatedRequest) {
    return this.journalService.listTemplates(req.user.sub);
  }

  @Post('templates')
  createTemplate(@Req() req: AuthenticatedRequest, @Body() dto: CreateJournalTemplateDto) {
    return this.journalService.createTemplate(req.user.sub, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateJournalTemplateDto,
  ) {
    return this.journalService.updateTemplate(req.user.sub, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.journalService.deleteTemplate(req.user.sub, id);
  }

  @Get('tags')
  listTags(@Req() req: AuthenticatedRequest) {
    return this.journalService.listTags(req.user.sub);
  }

  @Post('tags')
  createTag(@Req() req: AuthenticatedRequest, @Body() dto: CreateJournalTagDto) {
    return this.journalService.findOrCreateTag(req.user.sub, dto.name, dto.color);
  }

  @Get('weekly-summary')
  async weeklySummary(@Req() req: AuthenticatedRequest, @Query() query: WeeklySummaryQueryDto) {
    const legacy = await this.journalService.buildWeeklyReviewSnapshot(
      req.user.sub,
      hcmcDateOnly(query.periodStart),
      new Date(hcmcDateOnly(query.periodEnd).getTime() + 24 * 60 * 60 * 1000 - 1),
    );
    const reviewContext = await this.journalService.buildReviewContext(req.user.sub, {
      kind: 'WEEKLY',
      startDate: query.periodStart.slice(0, 10),
      endDate: query.periodEnd.slice(0, 10),
      timezone: query.timezone || 'Asia/Ho_Chi_Minh',
    });
    return { ...legacy, reviewContext };
  }

  @Get('daily-summary')
  dailySummary(@Req() req: AuthenticatedRequest, @Query() query: DailySummaryQueryDto) {
    return this.journalService.buildReviewContext(req.user.sub, {
      kind: 'DAILY',
      startDate: query.date.slice(0, 10),
      endDate: query.date.slice(0, 10),
      timezone: query.timezone || 'Asia/Ho_Chi_Minh',
    });
  }

  @Post('attachments/upload')
  async uploadAttachment(@Req() req: AuthenticatedMultipartRequest) {
    const upload = await req.file();
    if (!upload) throw new BadRequestException('File is required');
    const entryIdField = upload.fields.entryId as { value?: string } | undefined;
    const entryId = entryIdField?.value;
    if (!entryId) throw new BadRequestException('entryId is required');
    const clientIdField = upload.fields.attachmentId as { value?: string } | undefined;
    const attachmentId = clientIdField?.value || createUlid();
    const storageKey = `journal/${req.user.sub}/${attachmentId}_${upload.filename || 'file'}`;
    const buffer = await upload.toBuffer();
    await this.mediaStorage.storeRawBuffer(storageKey, buffer);
    return this.journalService.addAttachment(req.user.sub, {
      id: attachmentId,
      entryId,
      fileName: upload.filename || 'file',
      mimeType: upload.mimetype || 'application/octet-stream',
      sizeBytes: buffer.length,
      storageKey,
    });
  }

  @Get('attachments/:id/file')
  async getAttachmentFile(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res() res: FastifyReply) {
    const attachment = await this.journalService.getAttachment(req.user.sub, id);
    if (!attachment) throw new NotFoundException('Attachment not found');
    const stream = await this.mediaStorage.read(attachment.storageKey);
    if (!stream) throw new NotFoundException('Attachment file not found');
    res.header('Content-Type', attachment.mimeType);
    res.header('Cache-Control', 'private, max-age=3600');
    return res.send(stream);
  }

  @Delete('attachments/:id')
  deleteAttachment(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.journalService.deleteAttachment(req.user.sub, id);
  }
}
