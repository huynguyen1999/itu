import { ExerciseMetricType, GymWorkoutStatus, PaymentMethod, Prisma, RecurringFrequency, WeightUnit, WorkoutSetType } from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import { assertClientId, enumValue, fieldConflict, notFound, optionalString, requiredString, stale } from './prisma-sync.helpers';
import { createUlid } from './ulid';
import { SyncMergeResolver } from './sync-merge-resolver';
import { validateCalendarPreferences } from '@core/application/use-cases/preferences.service';
import { advanceRecurringDate } from '@core/domain/budget/recurrence';
import { BUDGET_KINDS, GYM_KINDS, ROUTINE_KINDS, GRANULAR_GYM_KINDS, PREFERENCE_KINDS, MONEY_GYM_KINDS, BUDGET_MONEY_KINDS, CATEGORY_ICONS, CATEGORY_COLORS, DATE_PATTERN, PERIOD_PATTERN, MONEY_PATTERN, validateCategoryVisuals, dateOnly, budgetPeriod, money } from './prisma-sync-budget-gym.shared';

export class PrismaSyncBudgetMutations {
  readonly kinds: readonly string[] = [...BUDGET_KINDS, ...PREFERENCE_KINDS, ...BUDGET_MONEY_KINDS];

  async applyMutation(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null | undefined> {
    if (PREFERENCE_KINDS.includes(mutation.kind)) return this.applyPreferences(tx, userId, mutation);
    if (BUDGET_KINDS.includes(mutation.kind)) return this.applyBudget(tx, userId, mutation);
    if (BUDGET_MONEY_KINDS.includes(mutation.kind)) return this.applyBudgetCatalog(tx, userId, mutation);
    return undefined;
  }

  private async applyPreferences(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const key = mutation.kind.startsWith('gym')
      ? 'gymPreferences'
      : mutation.kind.startsWith('journal')
        ? 'journalPreferences'
        : mutation.kind.startsWith('calendar')
          ? 'calendarPreferences'
          : 'budgetPreferences';
    const value = mutation.payload.preferences ?? mutation.payload.value ?? mutation.payload;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new InvalidSyncMutationException('Preferences payload must be an object');
    const current = await tx.userPreferences.findUnique({ where: { userId } });
    const existing = current?.[key] && typeof current[key] === 'object' && !Array.isArray(current[key]) ? current[key] as Record<string, unknown> : {};
    const merged = { ...existing, ...(value as Record<string, unknown>) };
    let normalized: object = merged;
    if (key === 'calendarPreferences') {
      try {
        normalized = validateCalendarPreferences(merged as any);
      } catch (error) {
        throw new InvalidSyncMutationException(error instanceof Error ? error.message : 'Invalid calendar preferences');
      }
    }
    const record = await tx.userPreferences.upsert({ where: { userId }, create: { userId, [key]: normalized as Prisma.InputJsonValue }, update: { [key]: normalized as Prisma.InputJsonValue } });
    await recordSyncChange(tx, userId, key.toLowerCase(), userId, 'UPSERT', record);
    return null;
  }


  private async applyBudgetCatalog(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind.startsWith('expensecategory.')) {
      if (mutation.kind === 'expensecategory.reorder') {
        const ids = Array.isArray(payload.categoryIds) ? payload.categoryIds.filter((id): id is string => typeof id === 'string') : [];
        for (const [sortOrder, id] of ids.entries()) {
          const row = await tx.expenseCategory.findFirst({ where: { id, userId } });
          if (!row) continue;
          const updated = await tx.expenseCategory.update({ where: { id }, data: { sortOrder, version: { increment: 1 } } });
          await recordSyncChange(tx, userId, 'expensecategory', updated.id, 'UPSERT', updated);
        }
        return null;
      }
      if (mutation.kind.endsWith('.create')) {
        assertClientId(mutation.entityId);
        const existing = await tx.expenseCategory.findFirst({ where: { id: mutation.entityId } });
        if (existing) {
          if (existing.userId !== userId) throw new InvalidSyncMutationException('Expense category does not belong to user');
          return null;
        }
        validateCategoryVisuals(optionalString(payload, 'icon'), optionalString(payload, 'color'));
        const row = await tx.expenseCategory.upsert({ where: { id: mutation.entityId }, create: { id: mutation.entityId, userId, name: requiredString(payload, 'name'), icon: optionalString(payload, 'icon'), color: optionalString(payload, 'color')?.toUpperCase(), sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0 }, update: {} });
        await recordSyncChange(tx, userId, 'expensecategory', row.id, 'UPSERT', row);
        return null;
      }
      const row = await tx.expenseCategory.findFirst({ where: { id: mutation.entityId, userId } });
      if (!row) return notFound(mutation, 'expensecategory');
      if (mutation.kind.endsWith('.archive')) {
        const updated = await tx.expenseCategory.update({ where: { id: row.id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
        await recordSyncChange(tx, userId, 'expensecategory', updated.id, 'DELETE', { id: updated.id });
        return null;
      }
      const conflict = fieldConflict(mutation, 'expensecategory', row);
      if (conflict) return conflict;
      validateCategoryVisuals(payload.icon === undefined ? row.icon : optionalString(payload, 'icon'), payload.color === undefined ? row.color : optionalString(payload, 'color'));
      const updated = await tx.expenseCategory.update({ where: { id: row.id }, data: { name: payload.name === undefined ? row.name : requiredString(payload, 'name'), icon: payload.icon === undefined ? row.icon : optionalString(payload, 'icon'), color: payload.color === undefined ? row.color : optionalString(payload, 'color')?.toUpperCase(), sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : row.sortOrder, version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'expensecategory', updated.id, 'UPSERT', updated);
      return null;
    }
    if (mutation.kind === 'monthlybudget.update') {
      const period = budgetPeriod(requiredString(payload, 'period'));
      const existing = await tx.monthlyBudget.findFirst({ where: { userId, period } });
      if (!existing) assertClientId(mutation.entityId);
      const row = existing ? await tx.monthlyBudget.update({ where: { id: existing.id }, data: { overallLimit: payload.overallLimit === null ? null : payload.overallLimit === undefined ? existing.overallLimit : money(payload.overallLimit, 'overallLimit'), version: { increment: 1 } } }) : await tx.monthlyBudget.create({ data: { id: mutation.entityId, userId, period, overallLimit: payload.overallLimit == null ? null : money(payload.overallLimit, 'overallLimit') } });
      await recordSyncChange(tx, userId, 'monthlybudget', row.id, 'UPSERT', row);
      return null;
    }
    if (mutation.kind.startsWith('categorybudget.')) {
      const categoryId = requiredString(payload, 'categoryId');
      const period = payload.period === undefined ? undefined : requiredString(payload, 'period');
      if (!payload.monthlyBudgetId && period === undefined) throw new InvalidSyncMutationException('category budget requires period or monthlyBudgetId');
      if (period !== undefined) budgetPeriod(period);
      const periodRow = await tx.monthlyBudget.findFirst({ where: { userId, ...(payload.monthlyBudgetId ? { id: requiredString(payload, 'monthlyBudgetId') } : { period }) } });
      if (!periodRow || !(await tx.expenseCategory.findFirst({ where: { id: categoryId, userId } }))) return notFound(mutation, 'categorybudget');
      if (mutation.kind.endsWith('.delete')) {
        await tx.categoryBudgetLimit.deleteMany({ where: { monthlyBudgetId: periodRow.id, categoryId } });
        await recordSyncChange(tx, userId, 'categorybudget', `${periodRow.id}:${categoryId}`, 'DELETE', { monthlyBudgetId: periodRow.id, categoryId });
      } else {
        const row = await tx.categoryBudgetLimit.upsert({ where: { monthlyBudgetId_categoryId: { monthlyBudgetId: periodRow.id, categoryId } }, create: { id: mutation.entityId || createUlid(), monthlyBudgetId: periodRow.id, categoryId, limit: money(payload.limit, 'limit') }, update: { limit: money(payload.limit, 'limit'), version: { increment: 1 } } });
        await recordSyncChange(tx, userId, 'categorybudget', row.id, 'UPSERT', row);
      }
      return null;
    }

    return null;
  }

  private async applyBudget(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind.startsWith('expense.')) {
      if (mutation.kind.endsWith('.create')) {
        assertClientId(mutation.entityId);
        const existing = await tx.expense.findFirst({ where: { id: mutation.entityId } });
        if (existing) {
          if (existing.userId !== userId) throw new InvalidSyncMutationException('Expense does not belong to user');
          return null;
        }
        const categoryId = requiredString(payload, 'categoryId');
        if (!(await tx.expenseCategory.findFirst({ where: { id: categoryId, userId } }))) return notFound(mutation, 'expensecategory');
      const row = await tx.expense.create({ data: { id: mutation.entityId, userId, amount: money(payload.amount, 'amount'), categoryId, merchant: optionalString(payload, 'merchant'), paymentMethod: enumValue(PaymentMethod, payload.paymentMethod ?? 'CASH', 'paymentMethod'), expenseDate: dateOnly(requiredString(payload, 'expenseDate'), 'expenseDate'), note: optionalString(payload, 'note'), recurringExpenseId: optionalString(payload, 'recurringExpenseId'), recurringOccurrenceDate: payload.recurringOccurrenceDate ? dateOnly(payload.recurringOccurrenceDate, 'recurringOccurrenceDate') : undefined }, include: { category: true } });
        await recordSyncChange(tx, userId, 'expense', row.id, 'UPSERT', row);
        return null;
      }
      const row = await tx.expense.findFirst({ where: { id: mutation.entityId, userId }, include: { category: true } });
      if (!row) return notFound(mutation, 'expense');
      if (mutation.kind.endsWith('.restore')) {
        if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'expense', row);
        const restored = await tx.expense.update({ where: { id: row.id }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } }, include: { category: true } });
        await recordSyncChange(tx, userId, 'expense', restored.id, 'UPSERT', restored);
        return null;
      }
      if (mutation.kind.endsWith('.delete')) {
        if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'expense', row);
        const deleted = await tx.expense.update({ where: { id: row.id }, data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } } });
        await recordSyncChange(tx, userId, 'expense', deleted.id, 'DELETE', { id: deleted.id });
        return null;
      }
      const conflict = fieldConflict(mutation, 'expense', row);
      if (conflict) return conflict;
      const categoryId = payload.categoryId === undefined ? row.categoryId : requiredString(payload, 'categoryId');
      if (payload.categoryId !== undefined && !(await tx.expenseCategory.findFirst({ where: { id: categoryId, userId } }))) return notFound(mutation, 'expensecategory');
      const updated = await tx.expense.update({ where: { id: row.id }, data: { amount: payload.amount === undefined ? row.amount : money(payload.amount, 'amount'), categoryId, merchant: payload.merchant === undefined ? row.merchant : optionalString(payload, 'merchant'), paymentMethod: payload.paymentMethod === undefined ? row.paymentMethod : enumValue(PaymentMethod, payload.paymentMethod, 'paymentMethod'), expenseDate: payload.expenseDate === undefined ? row.expenseDate : dateOnly(payload.expenseDate, 'expenseDate'), note: payload.note === undefined ? row.note : optionalString(payload, 'note'), version: { increment: 1 } }, include: { category: true } });
      await recordSyncChange(tx, userId, 'expense', updated.id, 'UPSERT', updated);
      return null;
    }
    const isCreate = mutation.kind === 'recurringexpense.create';
    if (isCreate) {
      assertClientId(mutation.entityId);
      const existing = await tx.recurringExpense.findFirst({ where: { id: mutation.entityId } });
      if (existing) {
        if (existing.userId !== userId) throw new InvalidSyncMutationException('Recurring expense does not belong to user');
        return null;
      }
      const categoryId = requiredString(payload, 'categoryId');
      if (!(await tx.expenseCategory.findFirst({ where: { id: categoryId, userId } }))) return notFound(mutation, 'expensecategory');
      const startDate = dateOnly(requiredString(payload, 'startDate'), 'startDate');
      const row = await tx.recurringExpense.create({ data: { id: mutation.entityId, userId, name: optionalString(payload, 'name'), categoryId, amount: money(payload.amount, 'amount'), merchant: optionalString(payload, 'merchant'), paymentMethod: enumValue(PaymentMethod, payload.paymentMethod ?? 'CASH', 'paymentMethod'), note: optionalString(payload, 'note'), frequency: enumValue(RecurringFrequency, payload.frequency ?? 'MONTHLY', 'frequency'), startDate, nextDueDate: payload.nextDueDate ? dateOnly(payload.nextDueDate, 'nextDueDate') : startDate }, include: { category: true } });
      await recordSyncChange(tx, userId, 'recurringexpense', row.id, 'UPSERT', row);
      return null;
    }
    const recurring = await tx.recurringExpense.findFirst({ where: { id: mutation.entityId, userId, archivedAt: null }, include: { category: true } });
    if (!recurring) return notFound(mutation, 'recurringexpense');
    if (mutation.kind === 'recurringexpense.archive') {
      const archived = await tx.recurringExpense.update({ where: { id: recurring.id }, data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } }, include: { category: true } });
      await recordSyncChange(tx, userId, 'recurringexpense', archived.id, 'DELETE', { id: archived.id });
      return null;
    }
    if (mutation.kind === 'recurringexpense.confirm' || mutation.kind === 'recurringexpense.skip') {
      const occurrenceDate = payload.occurrenceDate ? dateOnly(payload.occurrenceDate, 'occurrenceDate') : recurring.nextDueDate;
      if (occurrenceDate.getTime() !== recurring.nextDueDate.getTime()) return null;
      if (mutation.kind.endsWith('.confirm')) {
        const existing = await tx.expense.findFirst({ where: { recurringExpenseId: recurring.id, recurringOccurrenceDate: occurrenceDate }, include: { category: true } });
        if (existing) {
          const nextDueDate = advanceRecurringDate(occurrenceDate, recurring.frequency as 'WEEKLY' | 'MONTHLY' | 'YEARLY', recurring.startDate);
          const updated = await tx.recurringExpense.update({ where: { id: recurring.id }, data: { nextDueDate, version: { increment: 1 } }, include: { category: true } });
          await recordSyncChange(tx, userId, 'recurringexpense', updated.id, 'UPSERT', updated);
          return null;
        }
        const expense = await tx.expense.create({ data: { id: typeof payload.expenseId === 'string' ? payload.expenseId : createUlid(), userId, categoryId: recurring.categoryId, amount: recurring.amount, merchant: recurring.merchant, paymentMethod: recurring.paymentMethod, expenseDate: occurrenceDate, note: recurring.note, recurringExpenseId: recurring.id, recurringOccurrenceDate: occurrenceDate }, include: { category: true } });
        await recordSyncChange(tx, userId, 'expense', expense.id, 'UPSERT', expense);
      }
      const nextDueDate = advanceRecurringDate(occurrenceDate, recurring.frequency as 'WEEKLY' | 'MONTHLY' | 'YEARLY', recurring.startDate);
      const updated = await tx.recurringExpense.update({ where: { id: recurring.id }, data: { nextDueDate, version: { increment: 1 } }, include: { category: true } });
      await recordSyncChange(tx, userId, 'recurringexpense', updated.id, 'UPSERT', updated);
      return null;
    }
    const conflict = fieldConflict(mutation, 'recurringexpense', recurring);
    if (conflict) return conflict;
    const categoryId = payload.categoryId === undefined ? recurring.categoryId : requiredString(payload, 'categoryId');
    if (payload.categoryId !== undefined && !(await tx.expenseCategory.findFirst({ where: { id: categoryId, userId } }))) return notFound(mutation, 'expensecategory');
    const updated = await tx.recurringExpense.update({ where: { id: recurring.id }, data: { name: payload.name === undefined ? recurring.name : optionalString(payload, 'name'), categoryId, amount: payload.amount === undefined ? recurring.amount : money(payload.amount, 'amount'), merchant: payload.merchant === undefined ? recurring.merchant : optionalString(payload, 'merchant'), paymentMethod: payload.paymentMethod === undefined ? recurring.paymentMethod : enumValue(PaymentMethod, payload.paymentMethod, 'paymentMethod'), note: payload.note === undefined ? recurring.note : optionalString(payload, 'note'), frequency: payload.frequency === undefined ? recurring.frequency : enumValue(RecurringFrequency, payload.frequency, 'frequency'), startDate: payload.startDate === undefined ? recurring.startDate : dateOnly(payload.startDate, 'startDate'), nextDueDate: payload.nextDueDate === undefined ? recurring.nextDueDate : dateOnly(payload.nextDueDate, 'nextDueDate'), isActive: payload.isActive === undefined ? recurring.isActive : typeof payload.isActive === 'boolean' ? payload.isActive : (() => { throw new InvalidSyncMutationException('isActive must be a boolean') })(), version: { increment: 1 } }, include: { category: true } });
    await recordSyncChange(tx, userId, 'recurringexpense', updated.id, 'UPSERT', updated);
    return null;
  }


}

