import { Tx } from './prisma-sync-mutation.shared';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { BUDGET_KINDS, GYM_KINDS, ROUTINE_KINDS, GRANULAR_GYM_KINDS, PREFERENCE_KINDS, MONEY_GYM_KINDS } from './prisma-sync-budget-gym.shared';
import { PrismaSyncBudgetMutations } from './prisma-sync-budget-mutations';
import { PrismaSyncGymMutations } from './prisma-sync-gym-mutations';
import { PrismaSyncGranularGymMutations } from './prisma-sync-granular-gym-mutations';

export class PrismaSyncBudgetGym {
  private readonly budget = new PrismaSyncBudgetMutations();
  private readonly gym = new PrismaSyncGymMutations();
  private readonly granularGym = new PrismaSyncGranularGymMutations();
  readonly kinds: readonly string[] = [...BUDGET_KINDS, ...GYM_KINDS, ...ROUTINE_KINDS, ...GRANULAR_GYM_KINDS, ...PREFERENCE_KINDS, ...MONEY_GYM_KINDS];

  async applyMutation(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null | undefined> {
    if (this.granularGym.kinds.includes(mutation.kind)) return this.granularGym.applyMutation(tx, userId, mutation);
    if (this.budget.kinds.includes(mutation.kind)) return this.budget.applyMutation(tx, userId, mutation);
    if (this.gym.kinds.includes(mutation.kind)) return this.gym.applyMutation(tx, userId, mutation);
    return undefined;
  }
}
