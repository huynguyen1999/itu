import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches } from 'class-validator';

const CATEGORY_ICONS = ['food', 'transport', 'shopping', 'bills', 'health', 'education', 'entertainment', 'fitness', 'travel', 'other'];
const CATEGORY_COLORS = ['EMERALD', 'BLUE', 'VIOLET', 'AMBER', 'ROSE', 'INDIGO', 'TEAL', 'SLATE', 'emerald', 'blue', 'violet', 'amber', 'rose', 'indigo', 'teal', 'slate'];
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET', 'OTHER'] as const;
const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;
const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBudgetCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(CATEGORY_ICONS) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(CATEGORY_COLORS) color?: string;
  @ApiPropertyOptional() @IsOptional() sortOrder?: number;
}

export class UpdateBudgetCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(CATEGORY_ICONS) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(CATEGORY_COLORS) color?: string;
  @ApiPropertyOptional() @IsOptional() sortOrder?: number;
}

export class ReorderBudgetCategoriesDto {
  @ApiProperty({ type: [String] }) @IsString({ each: true }) categoryIds!: string[];
}

class ExpenseFieldsDto {
  @ApiProperty() @IsString() @Matches(MONEY_PATTERN) amount!: string;
  @ApiProperty() @IsString() categoryId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() merchant?: string;
  @ApiPropertyOptional({ enum: PAYMENT_METHODS }) @IsOptional() @IsEnum(PAYMENT_METHODS) paymentMethod?: (typeof PAYMENT_METHODS)[number];
  @ApiProperty() @IsString() @Matches(DATE_PATTERN) expenseDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateExpenseDto extends ExpenseFieldsDto {}

export class UpdateExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(MONEY_PATTERN) amount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() merchant?: string;
  @ApiPropertyOptional({ enum: PAYMENT_METHODS }) @IsOptional() @IsEnum(PAYMENT_METHODS) paymentMethod?: (typeof PAYMENT_METHODS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_PATTERN) expenseDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateMonthlyBudgetDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @Matches(MONEY_PATTERN) overallLimit!: string | null;
}

export class UpdateCategoryLimitDto {
  @ApiProperty() @IsString() @Matches(MONEY_PATTERN) limit!: string;
}

export class ExpenseQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(PERIOD_PATTERN) period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_PATTERN) from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_PATTERN) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ enum: PAYMENT_METHODS }) @IsOptional() @IsEnum(PAYMENT_METHODS) paymentMethod?: (typeof PAYMENT_METHODS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() merchant?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class CreateRecurringExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiProperty() @IsString() categoryId!: string;
  @ApiProperty() @IsString() @Matches(MONEY_PATTERN) amount!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() merchant?: string;
  @ApiPropertyOptional({ enum: PAYMENT_METHODS }) @IsOptional() @IsEnum(PAYMENT_METHODS) paymentMethod?: (typeof PAYMENT_METHODS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiProperty({ enum: FREQUENCIES }) @IsEnum(FREQUENCIES) frequency!: (typeof FREQUENCIES)[number];
  @ApiProperty() @IsString() @Matches(DATE_PATTERN) startDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_PATTERN) nextDueDate?: string;
}

export class UpdateRecurringExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(MONEY_PATTERN) amount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() merchant?: string;
  @ApiPropertyOptional({ enum: PAYMENT_METHODS }) @IsOptional() @IsEnum(PAYMENT_METHODS) paymentMethod?: (typeof PAYMENT_METHODS)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional({ enum: FREQUENCIES }) @IsOptional() @IsEnum(FREQUENCIES) frequency?: (typeof FREQUENCIES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_PATTERN) startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(DATE_PATTERN) nextDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
