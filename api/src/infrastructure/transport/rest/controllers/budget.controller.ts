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

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.budget)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('overview')
  getOverview(@Req() req: AuthenticatedRequest, @Query('period') period?: string) {
    const targetPeriod = period || new Date().toISOString().substring(0, 7);
    return this.budgetService.getOverview(req.user.sub, targetPeriod);
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
    return this.budgetService.getPeriod(req.user.sub, period);
  }

  @Put('periods/:period')
  updatePeriod(@Req() req: AuthenticatedRequest, @Param('period') period: string, @Body() dto: UpdatePeriodBudgetDto) {
    return this.budgetService.updatePeriod(req.user.sub, period, dto.overallLimit);
  }

  @Put('periods/:period/categories/:categoryId')
  updateCategoryLimit(
    @Req() req: AuthenticatedRequest,
    @Param('period') period: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryLimitDto,
  ) {
    return this.budgetService.updateCategoryLimit(req.user.sub, period, categoryId, dto.limit);
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
    });
  }

  @Get('transactions/:id')
  async getTransactionById(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tx = await this.budgetService.getTransactionById(req.user.sub, id);
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return tx;
  }

  @Post('transactions')
  createTransaction(@Req() req: AuthenticatedRequest, @Body() dto: CreateBudgetTransactionDto) {
    return this.budgetService.createTransaction(req.user.sub, {
      ...dto,
      transactionAt: new Date(dto.transactionAt),
    });
  }

  @Patch('transactions/:id')
  updateTransaction(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateBudgetTransactionDto) {
    return this.budgetService.updateTransaction(req.user.sub, id, {
      ...dto,
      transactionAt: dto.transactionAt ? new Date(dto.transactionAt) : undefined,
    });
  }

  @Delete('transactions/:id')
  deleteTransaction(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetService.deleteTransaction(req.user.sub, id);
  }
}
