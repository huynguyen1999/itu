import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { REST_ROUTES } from '../../../../core/application/constants/app.constants';
import { BudgetService } from '../../../../core/application/use-cases/budget.service';
import { AuthGuard } from '../guards/auth.guard';
import { CreateBudgetCategoryDto, CreateExpenseDto, CreateRecurringExpenseDto, ExpenseQueryDto, ReorderBudgetCategoriesDto, UpdateBudgetCategoryDto, UpdateCategoryLimitDto, UpdateExpenseDto, UpdateMonthlyBudgetDto, UpdateRecurringExpenseDto } from '../dto/budget.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { hcmcCurrentPeriod } from '@core/application/utils/calendar';

const date = (value: string) => {
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Budget dates must be valid YYYY-MM-DD values');
  }
  return parsed;
};

@UseGuards(AuthGuard)
@Controller(REST_ROUTES.budget)
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('summary') getSummary(@Req() req: AuthenticatedRequest, @Query('period') period = hcmcCurrentPeriod()) { return this.budgetService.getSummary(req.user.sub, period); }
  @Get('reports') getReports(@Req() req: AuthenticatedRequest, @Query('period') period = hcmcCurrentPeriod()) { return this.budgetService.getReport(req.user.sub, period); }
  @Get('statistics') getStatistics(@Req() req: AuthenticatedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) throw new BadRequestException('from and to are required together');
    return this.budgetService.getStatistics(req.user.sub, date(from), new Date(date(to).getTime() + 86_400_000));
  }

  @Get('categories') getCategories(@Req() req: AuthenticatedRequest) { return this.budgetService.getCategories(req.user.sub); }
  @Post('categories') createCategory(@Req() req: AuthenticatedRequest, @Body() dto: CreateBudgetCategoryDto) { return this.budgetService.createCategory(req.user.sub, dto); }
  @Patch('categories/reorder') reorderCategories(@Req() req: AuthenticatedRequest, @Body() dto: ReorderBudgetCategoriesDto) { return this.budgetService.reorderCategories(req.user.sub, dto.categoryIds); }
  @Patch('categories/:id') updateCategory(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateBudgetCategoryDto) { return this.budgetService.updateCategory(req.user.sub, id, dto); }
  @Delete('categories/:id') archiveCategory(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.budgetService.archiveCategory(req.user.sub, id); }

  @Get('months/:period') getMonthlyBudget(@Req() req: AuthenticatedRequest, @Param('period') period: string) { return this.budgetService.getMonthlyBudget(req.user.sub, period); }
  @Put('months/:period') updateMonthlyBudget(@Req() req: AuthenticatedRequest, @Param('period') period: string, @Body() dto: UpdateMonthlyBudgetDto) { return this.budgetService.updateMonthlyBudget(req.user.sub, period, dto.overallLimit); }
  @Put('months/:period/categories/:categoryId') updateCategoryLimit(@Req() req: AuthenticatedRequest, @Param('period') period: string, @Param('categoryId') categoryId: string, @Body() dto: UpdateCategoryLimitDto) { return this.budgetService.updateCategoryLimit(req.user.sub, period, categoryId, dto.limit); }
  @Delete('months/:period/categories/:categoryId') deleteCategoryLimit(@Req() req: AuthenticatedRequest, @Param('period') period: string, @Param('categoryId') categoryId: string) { return this.budgetService.deleteCategoryLimit(req.user.sub, period, categoryId); }

  @Get('expenses') getExpenses(@Req() req: AuthenticatedRequest, @Query() query: ExpenseQueryDto) { return this.budgetService.getExpenses(req.user.sub, { period: query.period, from: query.from ? date(query.from) : undefined, to: query.to ? date(query.to) : undefined, categoryId: query.categoryId, paymentMethod: query.paymentMethod, merchant: query.merchant, search: query.search }); }
  @Get('expenses/:id') async getExpense(@Req() req: AuthenticatedRequest, @Param('id') id: string) { const value = await this.budgetService.getExpense(req.user.sub, id); if (!value) throw new NotFoundException(`Expense ${id} not found`); return value; }
  @Post('expenses') createExpense(@Req() req: AuthenticatedRequest, @Body() dto: CreateExpenseDto) { return this.budgetService.createExpense(req.user.sub, { ...dto, expenseDate: date(dto.expenseDate) }); }
  @Patch('expenses/:id') updateExpense(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateExpenseDto) { return this.budgetService.updateExpense(req.user.sub, id, { ...dto, expenseDate: dto.expenseDate ? date(dto.expenseDate) : undefined }); }
  @Delete('expenses/:id') deleteExpense(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.budgetService.deleteExpense(req.user.sub, id); }

  @Get('recurring') getRecurring(@Req() req: AuthenticatedRequest) { return this.budgetService.getRecurringExpenses(req.user.sub); }
  @Post('recurring') createRecurring(@Req() req: AuthenticatedRequest, @Body() dto: CreateRecurringExpenseDto) { return this.budgetService.createRecurringExpense(req.user.sub, { ...dto, startDate: date(dto.startDate), nextDueDate: dto.nextDueDate ? date(dto.nextDueDate) : undefined }); }
  @Patch('recurring/:id') updateRecurring(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateRecurringExpenseDto) { return this.budgetService.updateRecurringExpense(req.user.sub, id, { ...dto, startDate: dto.startDate ? date(dto.startDate) : undefined, nextDueDate: dto.nextDueDate ? date(dto.nextDueDate) : undefined }); }
  @Delete('recurring/:id') archiveRecurring(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.budgetService.archiveRecurringExpense(req.user.sub, id); }
  @Post('recurring/:id/confirm') confirmRecurring(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('occurrenceDate') occurrenceDate?: string) { return this.budgetService.confirmRecurringOccurrence(req.user.sub, id, occurrenceDate ? date(occurrenceDate) : undefined); }
  @Post('recurring/:id/skip') skipRecurring(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body('occurrenceDate') occurrenceDate?: string) { return this.budgetService.skipRecurringOccurrence(req.user.sub, id, occurrenceDate ? date(occurrenceDate) : undefined); }
}
