import { Module } from '@nestjs/common';
import { BUDGET_REPOSITORY_PORT } from '../../core/application/ports/out/budget-repository.port';
import { BudgetService } from '../../core/application/use-cases/budget.service';
import { PrismaBudgetRepository } from '../../infrastructure/persistence/prisma/prisma-budget.repository';
import { BudgetController } from '../../infrastructure/transport/rest/controllers/budget.controller';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [BudgetController],
  providers: [
    BudgetService,
    {
      provide: BUDGET_REPOSITORY_PORT,
      useClass: PrismaBudgetRepository,
    },
  ],
  exports: [BudgetService],
})
export class BudgetModule {}
