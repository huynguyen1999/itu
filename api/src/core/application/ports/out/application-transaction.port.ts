/**
 * Transaction seam used by application workflows that must remain atomic.
 * Infrastructure adapters pass their transaction implementation through this
 * interface; application code never names an ORM transaction type.
 */
export interface TransactionCollection {
  findUnique(args?: any): Promise<any>;
  findUniqueOrThrow(args?: any): Promise<any>;
  findFirst(args?: any): Promise<any>;
  findMany(args?: any): Promise<any[]>;
  create(args?: any): Promise<any>;
  createMany(args?: any): Promise<any>;
  update(args?: any): Promise<any>;
  updateMany(args?: any): Promise<any>;
  upsert(args?: any): Promise<any>;
  delete(args?: any): Promise<any>;
  aggregate(args?: any): Promise<any>;
  count(args?: any): Promise<number>;
}

export interface ApplicationTransactionPort {
  growthAttributeMapping: TransactionCollection;
  growthCommitmentPenalty: TransactionCollection;
  growthCycle: TransactionCollection;
  growthEarningRule: TransactionCollection;
  growthEarningRuleSkill: TransactionCollection;
  growthInventoryTransaction: TransactionCollection;
  growthLedgerEntry: TransactionCollection;
  growthProfile: TransactionCollection;
  growthRewardPresetSetting: TransactionCollection;
  growthSkill: TransactionCollection;
  habitOccurrence: TransactionCollection;
  syncChange: TransactionCollection;
}
