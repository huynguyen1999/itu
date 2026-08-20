import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  GrowthAttributeMappingSlot,
  GrowthProgressKind,
  GrowthResetScope,
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthSourceType,
} from '@core/domain/enums';

export class CreateGrowthSkillDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsEnum(GrowthProgressKind) kind?: GrowthProgressKind;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(500) icon?: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsInt() @Min(10) @Max(10000) baseXp?: number;
}

export class UpdateGrowthSkillDto extends CreateGrowthSkillDto {
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class ReorderGrowthSkillsDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) skillIds!: string[];
}

export class GrowthAttributeMappingDto {
  @IsString() attributeId!: string;
  @IsEnum(GrowthAttributeMappingSlot) slot!: GrowthAttributeMappingSlot;
  @IsInt() @Min(1) @Max(100) weight!: number;
}

export class UpsertGrowthAttributeMappingsDto {
  @IsString() skillId!: string;
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => GrowthAttributeMappingDto)
  mappings!: GrowthAttributeMappingDto[];
}

export class GrowthSkillAwardDto {
  @IsString() skillId!: string;
  @IsInt() @Min(0) @Max(1_000_000) xpReward!: number;
}

export class GrowthItemAwardDto {
  @IsString() itemId!: string;
  @IsInt() @Min(1) @Max(10_000) quantity!: number;
}

export class UpsertGrowthEarningRuleDto {
  @IsEnum(GrowthSourceType) sourceType!: GrowthSourceType;
  @IsString() sourceId!: string;
  @IsInt() @Min(0) @Max(1_000_000) coinReward!: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) accountXp?: number;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsEnum(GrowthScalingMode) scalingMode?: GrowthScalingMode;
  @IsOptional() @IsInt() @Min(1) maxRewardCap?: number;
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => GrowthSkillAwardDto)
  skillAwards!: GrowthSkillAwardDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GrowthItemAwardDto)
  itemAwards?: GrowthItemAwardDto[];
}

export class CreateGrowthRewardDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(800) description?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000_000) price?: number | null;
  @IsOptional() @IsBoolean() listedInShop?: boolean;
  @IsOptional() @IsBoolean() repeatable?: boolean;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class UpdateGrowthRewardDto extends CreateGrowthRewardDto {
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class UpdateGrowthProfileDto {
  @IsOptional() @IsInt() @Min(10) @Max(10000) accountBaseXp?: number;
  @IsOptional() @IsEnum(GrowthRewardPreset) rewardPreset?: GrowthRewardPreset;
}

export class StarterSkillSelectionDto {
  @IsString() key!: string;
  @IsOptional() @IsString() @MaxLength(80) customName?: string;
}

export class CompleteOnboardingDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StarterSkillSelectionDto)
  skills!: StarterSkillSelectionDto[];
}

export class ApplyPresetDto {
  @IsEnum(GrowthRewardPreset) preset!: GrowthRewardPreset;
}

export class GrowthRewardPresetRuleDto {
  @IsEnum(GrowthSourceType) sourceType!: GrowthSourceType;
  @IsInt() @Min(0) @Max(1_000_000) coinReward!: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) accountXp?: number;
  @IsInt() @Min(0) @Max(1_000_000) xpRewardPerSkill!: number;
  @IsEnum(GrowthScalingMode) scalingMode!: GrowthScalingMode;
  @IsOptional() @IsInt() @Min(1) maxRewardCap?: number;
}

export class UpdateGrowthRewardPresetDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GrowthRewardPresetRuleDto)
  rules!: GrowthRewardPresetRuleDto[];
}

export class GrowthTaskRewardDefaultSkillDto {
  @IsString() skillId!: string;
  @IsInt() @Min(0) @Max(1_000_000) xpReward!: number;
}

export class UpsertGrowthTaskRewardDefaultDto {
  @IsOptional() @IsString() taskListId?: string | null;
  @IsInt() @Min(0) @Max(1_000_000) coinReward!: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) accountXp?: number;
  @IsBoolean() enabled!: boolean;
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => GrowthTaskRewardDefaultSkillDto)
  skillAwards!: GrowthTaskRewardDefaultSkillDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GrowthItemAwardDto)
  itemAwards?: GrowthItemAwardDto[];
}

export class CreateGrowthItemCategoryDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class UpdateGrowthItemCategoryDto extends CreateGrowthItemCategoryDto {
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class ReorderGrowthItemsDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) itemIds!: string[];
}

export class ReorderGrowthItemCategoriesDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) categoryIds!: string[];
}

export class ConsumeGrowthInventoryDto {
  @IsString() @MaxLength(160) idempotencyKey!: string;
}

export class ResetPreviewDto {
  @IsEnum(GrowthResetScope) scope!: GrowthResetScope;
  @IsOptional() @IsString() skillId?: string;
}

export class ExecuteResetDto {
  @IsEnum(GrowthResetScope) scope!: GrowthResetScope;
  @IsOptional() @IsString() skillId?: string;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsBoolean() keepEarningRules?: boolean;
  @IsOptional() @IsBoolean() keepShopRewards?: boolean;
}
