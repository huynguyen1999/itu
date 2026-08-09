import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsageService } from '@core/application/use-cases/usage.service';
import { AuthGuard } from '../guards/auth.guard';
import { BrowserExtensionDsnGuard } from '../guards/browser-extension-dsn.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import type { BrowserExtensionRequest } from '../types/browser-extension-request';
import {
  BrowserExtensionUsageBatchDto,
  UsageDateQueryDto,
  UsageSummaryBatchDto,
  WebsiteUsageSummaryBatchDto,
} from '../dto/usage.dto';
import { REST_ROUTES } from '@core/application/constants/app.constants';

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
@Controller(`${REST_ROUTES.usage}/${REST_ROUTES.usageWebsites}/${REST_ROUTES.usageSummaries}`)
export class WebsiteUsageController {
  constructor(private readonly usage: UsageService) {}

  @ApiOperation({ operationId: 'getWebsiteUsageSummaries' })
  @Get()
  get(@Req() req: AuthenticatedRequest, @Query() query: UsageDateQueryDto) {
    return this.usage.getWebsiteSummaries(req.user.sub, query.from ?? query.startDate, query.to ?? query.endDate);
  }

  @ApiOperation({ operationId: 'replaceWebsiteUsageSummaries' })
  @Post(REST_ROUTES.usageBatch)
  replace(@Req() req: AuthenticatedRequest, @Body() body: WebsiteUsageSummaryBatchDto) {
    return this.usage.replaceWebsiteBatch(req.user.sub, body);
  }

  @ApiOperation({ operationId: 'deleteWebsiteUsageSummaries' })
  @Delete()
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
}
