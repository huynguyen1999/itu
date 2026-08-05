import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GrowthProgressKind, GrowthSourceType } from '@prisma/client';
import { MEDIA_ERRORS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import { GrowthService } from '@core/application/use-cases/growth.service';
import { growthCurvePreview } from '@core/application/use-cases/growth-rules';
import { STARTER_SKILLS } from '@core/application/use-cases/growth-starter-skills';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import {
  ApplyPresetDto,
  CompleteOnboardingDto,
  ConsumeGrowthInventoryDto,
  CreateGrowthItemCategoryDto,
  CreateGrowthRewardDto,
  CreateGrowthSkillDto,
  ExecuteResetDto,
  ReorderGrowthSkillsDto,
  ReorderGrowthItemCategoriesDto,
  ReorderGrowthItemsDto,
  ResetPreviewDto,
  UpdateGrowthItemCategoryDto,
  UpdateGrowthProfileDto,
  UpdateGrowthRewardPresetDto,
  UpdateGrowthRewardDto,
  UpdateGrowthSkillDto,
  UpsertGrowthTaskRewardDefaultDto,
  UpsertGrowthEarningRuleDto,
  UpsertGrowthAttributeMappingsDto,
} from '../dto/growth.dto';
import type { AuthenticatedMultipartRequest, AuthenticatedRequest } from '../types/authenticated-request';
import { AuthGuard } from '../guards/auth.guard';
import { CursorPageQueryDto } from '../dto/pagination.dto';

@UseGuards(AuthGuard)
@Controller('growth')
export class GrowthController {
  constructor(
    private readonly growth: GrowthService,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly media: IMediaStorage,
  ) {}

  @Get('overview') overview(@Req() req: AuthenticatedRequest) {
    return this.growth.overview(req.user.sub);
  }

  @Get('profile') profile(@Req() req: AuthenticatedRequest) {
    return this.growth.getProfile(req.user.sub);
  }

  @Patch('profile') updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateGrowthProfileDto) {
    return this.growth.updateProfile(req.user.sub, dto);
  }

  @Get('curve-preview') curvePreview(
    @Query('baseXp') baseXp?: string,
    @Query('fromLevel') fromLevel?: string,
    @Query('count') count?: string,
  ) {
    const b = baseXp ? parseInt(baseXp, 10) : 100;
    const l = fromLevel ? parseInt(fromLevel, 10) : 1;
    const c = count ? parseInt(count, 10) : 10;
    return growthCurvePreview(b, l, c);
  }

  @Get('onboarding') async onboarding(@Req() req: AuthenticatedRequest) {
    const profile = await this.growth.getProfile(req.user.sub);
    return {
      starterSkills: STARTER_SKILLS,
      profile,
    };
  }

  @Post('onboarding') completeOnboarding(@Req() req: AuthenticatedRequest, @Body() dto: CompleteOnboardingDto) {
    return this.growth.completeOnboarding(req.user.sub, dto.skills);
  }

  @Get('reward-presets') rewardPresets() {
    return REWARD_PRESETS;
  }

  @Get('reward-presets/settings') rewardPresetSettings(@Req() req: AuthenticatedRequest) {
    return this.growth.getRewardPresets(req.user.sub);
  }

  @Patch('reward-presets/:preset') updateRewardPreset(
    @Req() req: AuthenticatedRequest,
    @Param('preset') preset: string,
    @Body() dto: UpdateGrowthRewardPresetDto,
  ) {
    return this.growth.updateRewardPreset(req.user.sub, preset, dto.rules);
  }

  @Post('apply-preset') applyPreset(@Req() req: AuthenticatedRequest, @Body() dto: ApplyPresetDto) {
    return this.growth.applyPreset(req.user.sub, dto.preset);
  }

  @Get('task-reward-defaults') taskRewardDefaults(@Req() req: AuthenticatedRequest) {
    return this.growth.listTaskRewardDefaults(req.user.sub);
  }

  @Post('task-reward-defaults') upsertTaskRewardDefault(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpsertGrowthTaskRewardDefaultDto,
  ) {
    return this.growth.upsertTaskRewardDefault(req.user.sub, dto);
  }

  @Post('reset/preview') previewReset(@Req() req: AuthenticatedRequest, @Body() dto: ResetPreviewDto) {
    return this.growth.previewReset(req.user.sub, dto.scope, dto.skillId);
  }

  @Post('reset') executeReset(@Req() req: AuthenticatedRequest, @Body() dto: ExecuteResetDto) {
    return this.growth.executeReset(req.user.sub, dto);
  }

  @Get('attributes') attributes(@Req() req: AuthenticatedRequest, @Query('includeArchived') includeArchived?: string) {
    return this.growth.listSkills(req.user.sub, includeArchived === 'true', GrowthProgressKind.ATTRIBUTE);
  }

  @Get('skills') skills(
    @Req() req: AuthenticatedRequest,
    @Query('kind') kind?: GrowthProgressKind,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.growth.listSkills(req.user.sub, includeArchived === 'true', kind);
  }

  @Post('skills/icon')
  async uploadSkillIcon(@Req() req: AuthenticatedMultipartRequest) {
    const upload = await req.file();
    if (!upload) throw new BadRequestException(MEDIA_ERRORS.imageFileRequired);

    const image = await this.media.storeUserImage({
      userId: req.user.sub,
      folder: 'growth-icons',
      originalName: upload.filename,
      mimeType: upload.mimetype,
      buffer: await upload.toBuffer(),
    });
    return { url: image.url, width: image.width, height: image.height };
  }

  @Post('skills') createSkill(@Req() req: AuthenticatedRequest, @Body() dto: CreateGrowthSkillDto) {
    return this.growth.createSkill(req.user.sub, dto);
  }

  @Patch('skills/:id') updateSkill(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGrowthSkillDto,
  ) {
    return this.growth.updateSkill(req.user.sub, id, dto);
  }

  @Post('skills/reorder') reorderSkills(@Req() req: AuthenticatedRequest, @Body() dto: ReorderGrowthSkillsDto) {
    return this.growth.reorderSkills(req.user.sub, dto.skillIds);
  }

  @Get('attribute-mappings') attributeMappings(@Req() req: AuthenticatedRequest, @Query('skillId') skillId?: string) {
    return this.growth.listAttributeMappings(req.user.sub, skillId);
  }

  @Post('attribute-mappings') upsertAttributeMappings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpsertGrowthAttributeMappingsDto,
  ) {
    return this.growth.upsertAttributeMappings(req.user.sub, dto);
  }

  @Get('earning-rules') rules(
    @Req() req: AuthenticatedRequest,
    @Query('sourceType') sourceType?: GrowthSourceType,
    @Query('sourceId') sourceId?: string,
  ) {
    return this.growth.listRules(req.user.sub, sourceType, sourceId);
  }

  @Post('earning-rules') upsertRule(@Req() req: AuthenticatedRequest, @Body() dto: UpsertGrowthEarningRuleDto) {
    return this.growth.upsertRule(req.user.sub, dto);
  }

  @Get('rewards') rewards(@Req() req: AuthenticatedRequest) {
    return this.growth.listRewards(req.user.sub);
  }

  @Get('items') items(@Req() req: AuthenticatedRequest, @Query('includeArchived') includeArchived?: string) {
    return this.growth.listRewards(req.user.sub, includeArchived === 'true');
  }

  @Post('rewards') createReward(@Req() req: AuthenticatedRequest, @Body() dto: CreateGrowthRewardDto) {
    return this.growth.createReward(req.user.sub, dto);
  }

  @Post('items') createItem(@Req() req: AuthenticatedRequest, @Body() dto: CreateGrowthRewardDto) {
    return this.growth.createReward(req.user.sub, dto);
  }

  @Patch('rewards/:id') updateReward(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGrowthRewardDto,
  ) {
    return this.growth.updateReward(req.user.sub, id, dto);
  }

  @Patch('items/:id') updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGrowthRewardDto,
  ) {
    return this.growth.updateReward(req.user.sub, id, dto);
  }

  @Post('items/reorder') reorderItems(@Req() req: AuthenticatedRequest, @Body() dto: ReorderGrowthItemsDto) {
    return this.growth.reorderItems(req.user.sub, dto.itemIds);
  }

  @Post('rewards/:id/redeem') redeem(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.growth.redeemReward(req.user.sub, id);
  }

  @Post('items/:id/purchase') purchaseItem(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.growth.redeemReward(req.user.sub, id);
  }

  @Get('item-categories') itemCategories(
    @Req() req: AuthenticatedRequest,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.growth.listItemCategories(req.user.sub, includeArchived === 'true');
  }

  @Post('item-categories') createItemCategory(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateGrowthItemCategoryDto,
  ) {
    return this.growth.createItemCategory(req.user.sub, dto);
  }

  @Patch('item-categories/:id') updateItemCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGrowthItemCategoryDto,
  ) {
    return this.growth.updateItemCategory(req.user.sub, id, dto);
  }

  @Post('item-categories/reorder') reorderItemCategories(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReorderGrowthItemCategoriesDto,
  ) {
    return this.growth.reorderItemCategories(req.user.sub, dto.categoryIds);
  }

  @Get('inventory') inventory(@Req() req: AuthenticatedRequest) {
    return this.growth.listInventory(req.user.sub);
  }

  @Get('inventory/history') inventoryHistory(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.growth.listInventoryHistory(req.user.sub, query);
  }

  @Post('inventory/:id/consume') consumeInventory(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ConsumeGrowthInventoryDto,
  ) {
    return this.growth.consumeInventoryItem(req.user.sub, id, dto.idempotencyKey);
  }

  @Get('ledger') ledger(
    @Req() req: AuthenticatedRequest,
    @Query('cycleId') cycleId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('currency') currency?: any,
    @Query('skillId') skillId?: string,
    @Query('kind') kind?: any,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query() query?: CursorPageQueryDto,
  ) {
    return this.growth.listLedger(req.user.sub, {
      cycleId,
      sourceType,
      currency,
      skillId,
      kind,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      ...query,
    });
  }

  @Get('statistics') statistics(
    @Req() req: AuthenticatedRequest,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const from = parseStatisticsDate(fromDate, 'fromDate');
    const to = parseStatisticsDate(toDate, 'toDate');
    if (from >= to) throw new BadRequestException('fromDate must be before toDate');
    return this.growth.statistics(req.user.sub, from, to);
  }

  @Get('redemptions') redemptions(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.growth.listRedemptions(req.user.sub, query);
  }
}

function parseStatisticsDate(value: string | undefined, field: string) {
  if (!value) throw new BadRequestException(`${field} is required`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
  return date;
}
