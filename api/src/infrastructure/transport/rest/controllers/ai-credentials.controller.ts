import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { REST_ROUTES } from '@core/application/constants/app.constants';
import { PERMISSIONS } from '@core/application/constants/permissions';
import { AiCredentialsService } from '@core/application/use-cases/ai-credentials.service';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { AuthGuard } from '../guards/auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';

export class AddAiCredentialDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  apiKey!: string;
}

export class UpdateAiCredentialDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.aiUse)
@Controller(`${REST_ROUTES.ai}/credentials`)
export class AiCredentialsController {
  constructor(private readonly credentials: AiCredentialsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.credentials.list(req.user.sub);
  }

  @Post()
  add(@Req() req: AuthenticatedRequest, @Body() dto: AddAiCredentialDto) {
    return this.credentials.add(req.user.sub, dto.apiKey);
  }

  @Patch(':id')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateAiCredentialDto) {
    return this.credentials.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.credentials.remove(req.user.sub, id);
    return { success: true };
  }

  @Post(':id/test')
  test(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.credentials.test(req.user.sub, id);
  }
}
