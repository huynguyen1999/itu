import { Inject, Injectable } from '@nestjs/common';
import {
  BUDGET_REPOSITORY_PORT,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateTransactionDto,
  UpdateTransactionDto,
} from '../ports/out/budget-repository.port';
import type { IBudgetRepositoryPort } from '../ports/out/budget-repository.port';
import {
  BudgetCategoryDomain,
  BudgetPeriodDomain,
  BudgetTransactionDomain,
  BudgetOverviewDomain,
} from '../../domain/budget/budget.domain';

@Injectable()
export class BudgetService {
  constructor(
    @Inject(BUDGET_REPOSITORY_PORT)
    private readonly budgetRepo: IBudgetRepositoryPort,
  ) {}

  async getCategories(userId: string): Promise<BudgetCategoryDomain[]> {
    return this.budgetRepo.getCategories(userId);
  }

  async createCategory(userId: string, dto: CreateCategoryDto): Promise<BudgetCategoryDomain> {
    return this.budgetRepo.createCategory(userId, dto);
  }

  async updateCategory(userId: string, id: string, dto: UpdateCategoryDto): Promise<BudgetCategoryDomain> {
    return this.budgetRepo.updateCategory(userId, id, dto);
  }

  async archiveCategory(userId: string, id: string): Promise<BudgetCategoryDomain> {
    return this.budgetRepo.archiveCategory(userId, id);
  }

  async reorderCategories(userId: string, categoryIds: string[]): Promise<BudgetCategoryDomain[]> {
    return this.budgetRepo.reorderCategories(userId, categoryIds);
  }

  async getPeriod(userId: string, periodStr: string): Promise<BudgetPeriodDomain> {
    return this.budgetRepo.getPeriod(userId, periodStr);
  }

  async updatePeriod(userId: string, periodStr: string, overallLimit: string): Promise<BudgetPeriodDomain> {
    return this.budgetRepo.updatePeriod(userId, periodStr, overallLimit);
  }

  async updateCategoryLimit(userId: string, periodStr: string, categoryId: string, limit: string): Promise<BudgetPeriodDomain> {
    return this.budgetRepo.updateCategoryLimit(userId, periodStr, categoryId, limit);
  }

  async deleteCategoryLimit(userId: string, periodStr: string, categoryId: string): Promise<BudgetPeriodDomain> {
    return this.budgetRepo.deleteCategoryLimit(userId, periodStr, categoryId);
  }

  async getTransactions(
    userId: string,
    options?: { period?: string; categoryId?: string; type?: 'EXPENSE' | 'INCOME' },
  ): Promise<BudgetTransactionDomain[]> {
    return this.budgetRepo.getTransactions(userId, options);
  }

  async getTransactionById(userId: string, id: string): Promise<BudgetTransactionDomain | null> {
    return this.budgetRepo.getTransactionById(userId, id);
  }

  async createTransaction(userId: string, dto: CreateTransactionDto): Promise<BudgetTransactionDomain> {
    return this.budgetRepo.createTransaction(userId, dto);
  }

  async updateTransaction(userId: string, id: string, dto: UpdateTransactionDto): Promise<BudgetTransactionDomain> {
    return this.budgetRepo.updateTransaction(userId, id, dto);
  }

  async deleteTransaction(userId: string, id: string): Promise<void> {
    return this.budgetRepo.deleteTransaction(userId, id);
  }

  async getOverview(userId: string, periodStr: string): Promise<BudgetOverviewDomain> {
    return this.budgetRepo.getOverview(userId, periodStr);
  }
}
