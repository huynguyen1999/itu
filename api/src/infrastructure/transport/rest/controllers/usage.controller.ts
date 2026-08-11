import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsageService } from '@core/application/use-cases/usage.service';
import { AuthGuard } from '../guards/auth.guard';
import { BrowserExtensionDsnGuard } from '../guards/browser-extension-dsn.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import type { BrowserExtensionRequest } from '../types/browser-extension-request';
import {
  BrowserExtensionUsageBatchDto,
  UsageDateQueryDto,
  UsageSummaryBatchDto,
  WebsiteActivitySessionBatchDto,
  WebsiteUsageQueryDto,
  WebsiteUsageSummaryBatchDto,
  WebsiteUrlQueryDto,
} from '../dto/usage.dto';
import { REST_ROUTES } from '@core/application/constants/app.constants';
import { MEDIA_ERRORS } from '@core/application/constants/app.constants';
import type { AuthenticatedMultipartRequest } from '../types/authenticated-request';

@ApiTags('Usage')
@UseGuards(AuthGuard)
@Controller(`${REST_ROUTES.usage}/${REST_ROUTES.usageSummaries}`)
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @ApiOperation({ operationId: 'getUsageSummaries' })
  @Get()
  get(@Req() req: AuthenticatedRequest, @Query() query: UsageDateQueryDto) {
    return this.usage.getSummaries(req.user.sub, query.from ?? query.startDate, query.to ?? query.endDate);
  }

  @ApiOperation({ operationId: 'replaceUsageSummaries' })
  @Post(REST_ROUTES.usageBatch)
  replace(@Req() req: AuthenticatedRequest, @Body() body: UsageSummaryBatchDto) {
    return this.usage.replaceBatch(req.user.sub, body);
  }

  @ApiOperation({ operationId: 'deleteUsageSummaries' })
  @Delete()
  delete(@Req() req: AuthenticatedRequest, @Query() query: UsageDateQueryDto, @Query('all') all?: string) {
    return this.usage.delete(req.user.sub, query.from ?? query.startDate, query.to ?? query.endDate, all === 'true');
  }
}

@ApiTags('Usage')
@UseGuards(AuthGuard)
@Controller(`${REST_ROUTES.usage}/${REST_ROUTES.usageWebsites}`)
export class WebsiteUsageController {
  constructor(private readonly usage: UsageService) {}

  @ApiOperation({ operationId: 'getWebsiteUsageSummaries' })
  @Get(REST_ROUTES.usageSummaries)
  get(@Req() req: AuthenticatedRequest, @Query() query: WebsiteUsageQueryDto) {
    const includeUrlDetails = query.includeUrlDetails !== 'false';
    return this.usage.getWebsiteSummaries(
      req.user.sub,
      query.from ?? query.startDate,
      query.to ?? query.endDate,
      includeUrlDetails,
    );
  }

  @ApiOperation({ operationId: 'getWebsiteActivityStatistics' })
  @Get(REST_ROUTES.usageStatistics)
  statistics(@Req() req: AuthenticatedRequest, @Query() query: UsageDateQueryDto) {
    return this.usage.getWebsiteStatistics(
      req.user.sub,
      query.from ?? query.startDate,
      query.to ?? query.endDate,
    );
  }

  @ApiOperation({ operationId: 'getWebsiteActivitySessions' })
  @Get(REST_ROUTES.usageSessions)
  async sessions(@Req() req: AuthenticatedRequest, @Query() query: UsageDateQueryDto) {
    const statistics = await this.usage.getWebsiteStatistics(
      req.user.sub,
      query.from ?? query.startDate,
      query.to ?? query.endDate,
    );
    return { from: statistics.from, to: statistics.to, sessions: statistics.sessions };
  }

  @ApiOperation({ operationId: 'getWebsiteUrls' })
  @Get('urls')
  getUrls(@Req() req: AuthenticatedRequest, @Query() query: WebsiteUrlQueryDto) {
    return this.usage.getWebsiteUrls(
      req.user.sub,
      query.hostname,
      query.from ?? query.startDate,
      query.to ?? query.endDate,
      query.limit,
      query.offset,
    );
  }

  @ApiOperation({ operationId: 'replaceWebsiteUsageSummaries' })
  @Post(`${REST_ROUTES.usageSummaries}/${REST_ROUTES.usageBatch}`)
  replace(@Req() req: AuthenticatedRequest, @Body() body: WebsiteUsageSummaryBatchDto) {
    return this.usage.replaceWebsiteBatch(req.user.sub, body);
  }

  @ApiOperation({ operationId: 'deleteWebsiteUsageSummaries' })
  @Delete(REST_ROUTES.usageSummaries)
  delete(@Req() req: AuthenticatedRequest, @Query() query: UsageDateQueryDto, @Query('all') all?: string) {
    return this.usage.deleteWebsite(
      req.user.sub,
      query.from ?? query.startDate,
      query.to ?? query.endDate,
      all === 'true',
    );
  }
}

@ApiTags('Usage')
@Controller(`${REST_ROUTES.usage}/${REST_ROUTES.usageWebsites}`)
export class BrowserExtensionUsageController {
  constructor(private readonly usage: UsageService) {}

  @ApiOperation({ operationId: 'generateBrowserExtensionDsn' })
  @UseGuards(AuthGuard)
  @Post(REST_ROUTES.usageDsn)
  generateDsn(@Req() req: AuthenticatedRequest) {
    return this.usage.generateBrowserExtensionDsn(req.user.sub);
  }

  @ApiOperation({ operationId: 'ingestBrowserExtensionUsage' })
  @UseGuards(BrowserExtensionDsnGuard)
  @Post(REST_ROUTES.usageIngest)
  ingest(@Req() req: BrowserExtensionRequest, @Body() body: BrowserExtensionUsageBatchDto) {
    return this.usage.ingestBrowserExtension(req.browserExtension.userId, body);
  }

  @ApiOperation({ operationId: 'ingestWebsiteActivitySessions' })
  @UseGuards(BrowserExtensionDsnGuard)
  @Post(REST_ROUTES.usageSessionIngest)
  ingestSessions(@Req() req: BrowserExtensionRequest, @Body() body: WebsiteActivitySessionBatchDto) {
    return this.usage.ingestWebsiteActivitySessions(req.browserExtension.userId, body);
  }
}

@ApiTags('Usage')
@UseGuards(AuthGuard)
@Controller(`${REST_ROUTES.usage}/apps`)
export class UsageAppController {
  constructor(private readonly usage: UsageService) {}

  @ApiOperation({ operationId: 'getUsageAppIdentities' })
  @Get()
  getApps(@Req() req: AuthenticatedRequest) {
    return this.usage.getAppIdentities(req.user.sub);
  }

  @ApiOperation({ operationId: 'replaceUsageAppIcon' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['displayName', 'image'],
      properties: {
        displayName: { type: 'string', minLength: 1, maxLength: 255 },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @Put(':bundleId/icon')
  async replaceIcon(@Req() req: AuthenticatedMultipartRequest, @Param('bundleId') bundleId: string) {
    const upload = await req.file();
    if (!upload) throw new BadRequestException(MEDIA_ERRORS.imageFileRequired);
    const displayName = (upload.fields.displayName as { value?: unknown } | undefined)?.value;
    if (typeof displayName !== 'string') throw new BadRequestException('displayName is required');
    return this.usage.replaceAppIcon(req.user.sub, {
      bundleId,
      displayName,
      originalName: upload.filename,
      mimeType: upload.mimetype,
      buffer: await upload.toBuffer(),
    });
  }
}
