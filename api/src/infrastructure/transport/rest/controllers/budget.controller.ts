import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { REST_ROUTES } from '../../../../core/application/constants/app.constants';
import { BudgetService } from '../../../../core/application/use-cases/budget.service';
import { AuthGuard } from '../guards/auth.guard';
import {
  CreateBudgetCategoryDto,
  UpdateBudgetCategoryDto,
  ReorderBudgetCategoriesDto,
  CreateBudgetTransactionDto,
  UpdateBudgetTransactionDto,
  UpdatePeriodBudgetDto,
  UpdateCategoryLimitDto,
  BudgetTransactionQueryDto,
} from '../dto/budget.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { hcmcCurrentPeriod } from '@core/application/utils/calendar';

const money = (value: string): string => value || '0.00';
const mapPeriodMoney = (period: any) => period ? { ...period, overallLimit: money(period.overallLimit), categoryBudgets: (period.categoryBudgets || []).map((budget: any) => ({ ...budget, limit: money(budget.limit) })) } : period;
const mapTransactionMoney = (transaction: any) => transaction ? { ...transaction, amount: money(transaction.amount) } : transaction;
const mapOverviewMoney = (overview: any) => ({ ...overview, income: money(overview.income), spent: money(overview.spent), overallBudget: money(overview.overallBudget), remainingBudget: money(overview.remainingBudget), categories: (overview.categories || []).map((item: any) => ({ ...item, budget: money(item.budget), spent: money(item.spent), remaining: money(item.remaining) })) });

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.budget)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('overview')
  getOverview(@Req() req: AuthenticatedRequest, @Query('period') period?: string) {
    const targetPeriod = period || hcmcCurrentPeriod();
    return this.budgetService.getOverview(req.user.sub, targetPeriod).then(mapOverviewMoney);
  }

  @Get('categories')
  getCategories(@Req() req: AuthenticatedRequest) {
    return this.budgetService.getCategories(req.user.sub);
  }

  @Post('categories')
  createCategory(@Req() req: AuthenticatedRequest, @Body() dto: CreateBudgetCategoryDto) {
    return this.budgetService.createCategory(req.user.sub, dto);
  }

  @Patch('categories/reorder')
  reorderCategories(@Req() req: AuthenticatedRequest, @Body() dto: ReorderBudgetCategoriesDto) {
    return this.budgetService.reorderCategories(req.user.sub, dto.categoryIds);
  }

  @Patch('categories/:id')
  updateCategory(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateBudgetCategoryDto) {
    return this.budgetService.updateCategory(req.user.sub, id, dto);
  }

  @Delete('categories/:id')
  archiveCategory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetService.archiveCategory(req.user.sub, id);
  }

  @Get('periods/:period')
  getPeriod(@Req() req: AuthenticatedRequest, @Param('period') period: string) {
    return this.budgetService.getPeriod(req.user.sub, period).then(mapPeriodMoney);
  }

  @Put('periods/:period')
  updatePeriod(@Req() req: AuthenticatedRequest, @Param('period') period: string, @Body() dto: UpdatePeriodBudgetDto) {
    return this.budgetService.updatePeriod(req.user.sub, period, dto.overallLimit).then(mapPeriodMoney);
  }

  @Put('periods/:period/categories/:categoryId')
  updateCategoryLimit(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryLimitDto,
  ) {
    return this.budgetService.updateCategoryLimit(req.user.sub, period, categoryId, dto.limit).then(mapPeriodMoney);
  }

  @Delete('periods/:period/categories/:categoryId')
  deleteCategoryLimit(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.budgetService.deleteCategoryLimit(req.user.sub, period, categoryId);
  }

  @Get('transactions')
  getTransactions(@Req() req: AuthenticatedRequest, @Query() query: BudgetTransactionQueryDto) {
    return this.budgetService.getTransactions(req.user.sub, {
      period: query.period,
      categoryId: query.categoryId,
      type: query.type,
    }).then((items) => items.map(mapTransactionMoney));
  }

  @Get('transactions/:id')
  async getTransactionById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tx = await this.budgetService.getTransactionById(req.user.sub, id);
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return mapTransactionMoney(tx);
  }

  @Post('transactions')
  createTransaction(@Req() req: AuthenticatedRequest, @Body() dto: CreateBudgetTransactionDto) {
    return this.budgetService.createTransaction(req.user.sub, {
      ...dto,
      amount: dto.amount,
      transactionAt: new Date(dto.transactionAt),
    }).then(mapTransactionMoney);
  }

  @Patch('transactions/:id')
  updateTransaction(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateBudgetTransactionDto) {
    return this.budgetService.updateTransaction(req.user.sub, id, {
      ...dto,
      amount: dto.amount,
      transactionAt: dto.transactionAt ? new Date(dto.transactionAt) : undefined,
    }).then(mapTransactionMoney);
  }

  @Delete('transactions/:id')
  deleteTransaction(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetService.deleteTransaction(req.user.sub, id);
  }
}
