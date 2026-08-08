import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBudgetCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateBudgetCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class ReorderBudgetCategoriesDto {
  @IsString({ each: true })
  categoryIds!: string[];
}

export class CreateBudgetTransactionDto {
  @IsEnum(['EXPENSE', 'INCOME'])
  type!: 'EXPENSE' | 'INCOME';

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsString()
  transactionAt!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateBudgetTransactionDto {
  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  transactionAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePeriodBudgetDto {
  @IsNumber()
  @Min(0)
  overallLimit!: number;
}

export class UpdateCategoryLimitDto {
  @IsNumber()
  @Min(0)
  limit!: number;
}

export class BudgetTransactionQueryDto {
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(['EXPENSE', 'INCOME'])
  type?: 'EXPENSE' | 'INCOME';
}
