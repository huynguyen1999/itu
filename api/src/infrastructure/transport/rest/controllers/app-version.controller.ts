import { Controller, Get, Query } from '@nestjs/common';
import { AppVersionService } from '@core/application/use-cases/app-version.service';
import { CheckAppVersionQueryDto } from '../dto/app-version.dto';

@Controller('app-version')
export class AppVersionController {
  constructor(private readonly appVersion: AppVersionService) {}

  @Get('check')
  check(@Query() query: CheckAppVersionQueryDto) {
    return this.appVersion.check(query);
  }
}
