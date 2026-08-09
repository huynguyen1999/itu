import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Color token' })
  @IsOptional()
  @IsString()
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
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Color token' })
  @IsOptional()
  @IsString()
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
  @IsNumber()
  @Min(0)
  amount!: number;

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
  @IsNumber()
  @Min(0)
  amount?: number;

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
  @IsNumber()
  @Min(0)
  overallLimit!: number;
}

export class UpdateCategoryLimitDto {
  @ApiProperty({ description: 'Category budget limit' })
  @IsNumber()
  @Min(0)
  limit!: number;
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
