import { PaymentMethod as PrismaPaymentMethod, Prisma } from '@prisma/client';
import { DomainException } from '@core/domain/exceptions';
import type { PaymentMethod } from '@core/domain/budget/budget.domain';

export const BUDGET_CATEGORY_CATALOG = [
  { name: 'Food', icon: 'food', color: 'EMERALD' },
  { name: 'Transport', icon: 'transport', color: 'BLUE' },
  { name: 'Shopping', icon: 'shopping', color: 'VIOLET' },
  { name: 'Bills', icon: 'bills', color: 'AMBER' },
  { name: 'Health', icon: 'health', color: 'ROSE' },
  { name: 'Education', icon: 'education', color: 'INDIGO' },
  { name: 'Entertainment', icon: 'entertainment', color: 'TEAL' },
  { name: 'Fitness', icon: 'fitness', color: 'EMERALD' },
  { name: 'Travel', icon: 'travel', color: 'SLATE' },
  { name: 'Other', icon: 'other', color: 'SLATE' },
] as const;

const CATEGORY_ICONS = new Set<string>(BUDGET_CATEGORY_CATALOG.map((item) => item.icon));
const CATEGORY_COLORS = new Set(['EMERALD', 'BLUE', 'VIOLET', 'AMBER', 'ROSE', 'INDIGO', 'TEAL', 'SLATE']);
const PAYMENT_METHODS = new Set<string>(Object.values(PrismaPaymentMethod));

export const asMoney = (value: Prisma.Decimal | string | number | null | undefined) => value == null ? null : new Prisma.Decimal(value).toFixed(2);
export const asDateOnly = (value: Date) => new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
export const dateOnlyMonthBounds = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return { start: new Date(`${period}-01T00:00:00.000Z`), end: new Date(`${next}-01T00:00:00.000Z`) };
};
const periodPattern = /^(\d{4})-(\d{2})$/;

export function assertBudgetPeriod(period: string): void {
  const match = periodPattern.exec(period);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw new DomainException('Budget period must be a valid YYYY-MM value', 'INVALID_BUDGET_PERIOD', 400);
}

export const previousPeriod = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
};

export function validateVisuals(icon?: string | null, color?: string | null): void {
  if (icon != null && !CATEGORY_ICONS.has(icon)) throw new DomainException('Unsupported expense category icon', 'INVALID_CATEGORY', 400);
  if (color != null && !CATEGORY_COLORS.has(color.toUpperCase())) throw new DomainException('Unsupported expense category color', 'INVALID_CATEGORY', 400);
}

export function validatePaymentMethod(value: string | undefined): PaymentMethod {
  const normalized = value ?? PrismaPaymentMethod.CASH;
  if (!PAYMENT_METHODS.has(normalized)) throw new DomainException('Unsupported payment method', 'INVALID_PAYMENT_METHOD', 400);
  return normalized as PaymentMethod;
}

