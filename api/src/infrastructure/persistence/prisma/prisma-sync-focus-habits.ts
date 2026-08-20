import { Tx } from './prisma-sync-mutation.shared';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { PrismaSyncFocusMutations } from './prisma-sync-focus-mutations';
import { PrismaSyncHabitMutations } from './prisma-sync-habit-mutations';

export class PrismaSyncFocusHabits {
  private readonly focus = new PrismaSyncFocusMutations();
  private readonly habits = new PrismaSyncHabitMutations();
  readonly kinds: readonly string[] = [...this.focus.kinds, ...this.habits.kinds];

  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null | undefined> {
    if (this.focus.kinds.includes(mutation.kind as (typeof this.focus.kinds)[number])) return this.focus.applyMutation(tx, userId, mutation, outcome);
    if (this.habits.kinds.includes(mutation.kind as (typeof this.habits.kinds)[number])) return this.habits.applyMutation(tx, userId, mutation, outcome);
    return undefined;
  }
}
