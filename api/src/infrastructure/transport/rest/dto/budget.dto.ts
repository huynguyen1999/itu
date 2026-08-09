import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

const CATEGORY_ICONS = ['food', 'transport', 'shopping', 'bills', 'health', 'education', 'entertainment', 'fitness', 'travel', 'other'];
const CATEGORY_COLORS = ['EMERALD', 'BLUE', 'VIOLET', 'AMBER', 'ROSE', 'INDIGO', 'TEAL', 'SLATE', 'emerald', 'blue', 'violet', 'amber', 'rose', 'indigo', 'teal', 'slate'];
const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class CreateBudgetCategoryDto {
  @ApiProperty({ description: 'Category name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ enum: ['EXPENSE', 'INCOME'], default: 'EXPENSE' })
  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';

  @ApiPropertyOptional({ description: 'Icon identifier' })
  @IsOptional()
  @IsIn(CATEGORY_ICONS)
  icon?: string;

  @ApiPropertyOptional({ description: 'Color token' })
  @IsOptional()
  @IsIn(CATEGORY_COLORS)
  color?: string;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateBudgetCategoryDto {
  @ApiPropertyOptional({ description: 'Category name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['EXPENSE', 'INCOME'] })
  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';

  @ApiPropertyOptional({ description: 'Icon identifier' })
  @IsOptional()
  @IsIn(CATEGORY_ICONS)
  icon?: string;

  @ApiPropertyOptional({ description: 'Color token' })
  @IsOptional()
  @IsIn(CATEGORY_COLORS)
  color?: string;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class ReorderBudgetCategoriesDto {
  @ApiProperty({ description: 'Ordered category IDs', type: [String] })
  @IsString({ each: true })
  categoryIds!: string[];
}

export class CreateBudgetTransactionDto {
  @ApiProperty({ enum: ['EXPENSE', 'INCOME'] })
  @IsEnum(['EXPENSE', 'INCOME'])
  type!: 'EXPENSE' | 'INCOME';

  @ApiProperty({ description: 'Transaction amount' })
  @IsString()
  @Matches(MONEY_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ description: 'Currency code', default: 'VND' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Category ID' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({ description: 'Merchant or payee' })
  @IsOptional()
  @IsString()
  merchant?: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiProperty({ description: 'ISO date string of transaction' })
  @IsString()
  transactionAt!: string;

  @ApiPropertyOptional({ description: 'Optional note' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateBudgetTransactionDto {
  @ApiPropertyOptional({ enum: ['EXPENSE', 'INCOME'] })
  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';

  @ApiPropertyOptional({ description: 'Transaction amount' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  amount?: string;

  @ApiPropertyOptional({ description: 'Currency code' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Merchant or payee' })
  @IsOptional()
  @IsString()
  merchant?: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'ISO date string of transaction' })
  @IsOptional()
  @IsString()
  transactionAt?: string;

  @ApiPropertyOptional({ description: 'Optional note' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePeriodBudgetDto {
  @ApiProperty({ description: 'Overall period limit' })
  @IsString()
  @Matches(MONEY_PATTERN)
  overallLimit!: string;
}

export class UpdateCategoryLimitDto {
  @ApiProperty({ description: 'Category budget limit' })
  @IsString()
  @Matches(MONEY_PATTERN)
  limit!: string;
}

export class BudgetTransactionQueryDto {
  @ApiPropertyOptional({ description: 'Period string YYYY-MM' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ description: 'Filter by Category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['EXPENSE', 'INCOME'] })
  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';
}
