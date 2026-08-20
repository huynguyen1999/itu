import type {
  CreateCategoryDto,
  CreateExpenseDto,
  CreateRecurringExpenseDto,
  ExpenseFilters,
  IBudgetRepositoryPort,
  UpdateCategoryDto,
  UpdateExpenseDto,
  UpdateRecurringExpenseDto,
} from '../ports/out/budget-repository.port';

export class BudgetService {
  constructor(private readonly budgetRepo: IBudgetRepositoryPort) {}
  getCategories(userId: string) { return this.budgetRepo.getCategories(userId); }
  createCategory(userId: string, dto: CreateCategoryDto) { return this.budgetRepo.createCategory(userId, dto); }
  updateCategory(userId: string, id: string, dto: UpdateCategoryDto) { return this.budgetRepo.updateCategory(userId, id, dto); }
  archiveCategory(userId: string, id: string) { return this.budgetRepo.archiveCategory(userId, id); }
  reorderCategories(userId: string, ids: string[]) { return this.budgetRepo.reorderCategories(userId, ids); }
  getMonthlyBudget(userId: string, period: string) { return this.budgetRepo.getMonthlyBudget(userId, period); }
  updateMonthlyBudget(userId: string, period: string, overallLimit: string | null) { return this.budgetRepo.updateMonthlyBudget(userId, period, overallLimit); }
  updateCategoryLimit(userId: string, period: string, categoryId: string, limit: string) { return this.budgetRepo.updateCategoryLimit(userId, period, categoryId, limit); }
  deleteCategoryLimit(userId: string, period: string, categoryId: string) { return this.budgetRepo.deleteCategoryLimit(userId, period, categoryId); }
  getExpenses(userId: string, filters?: ExpenseFilters) { return this.budgetRepo.getExpenses(userId, filters); }
  getExpense(userId: string, id: string) { return this.budgetRepo.getExpense(userId, id); }
  createExpense(userId: string, dto: CreateExpenseDto) { return this.budgetRepo.createExpense(userId, dto); }
  updateExpense(userId: string, id: string, dto: UpdateExpenseDto) { return this.budgetRepo.updateExpense(userId, id, dto); }
  deleteExpense(userId: string, id: string) { return this.budgetRepo.deleteExpense(userId, id); }
  restoreExpense(userId: string, id: string) { return this.budgetRepo.restoreExpense(userId, id); }
  getRecurringExpenses(userId: string) { return this.budgetRepo.getRecurringExpenses(userId); }
  createRecurringExpense(userId: string, dto: CreateRecurringExpenseDto) { return this.budgetRepo.createRecurringExpense(userId, dto); }
  updateRecurringExpense(userId: string, id: string, dto: UpdateRecurringExpenseDto) { return this.budgetRepo.updateRecurringExpense(userId, id, dto); }
  archiveRecurringExpense(userId: string, id: string) { return this.budgetRepo.archiveRecurringExpense(userId, id); }
  confirmRecurringOccurrence(userId: string, id: string, date?: Date) { return this.budgetRepo.confirmRecurringOccurrence(userId, id, date); }
  skipRecurringOccurrence(userId: string, id: string, date?: Date) { return this.budgetRepo.skipRecurringOccurrence(userId, id, date); }
  getSummary(userId: string, period: string) { return this.budgetRepo.getSummary(userId, period); }
  getReport(userId: string, period: string) { return this.budgetRepo.getReport(userId, period); }
  getStatistics(userId: string, from: Date, to: Date) { return this.budgetRepo.getStatistics(userId, from, to); }
}
