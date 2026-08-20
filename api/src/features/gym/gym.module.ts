import { Module } from '@nestjs/common';
import { GYM_REPOSITORY_PORT } from '../../core/application/ports/out/gym-repository.port';
import { GymService } from '../../core/application/use-cases/gym.service';
import { PrismaGymRepository } from '../../infrastructure/persistence/prisma/prisma-gym.repository';
import { GymController } from '../../infrastructure/transport/rest/controllers/gym.controller';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { MediaModule } from '../../infrastructure/media/media.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [GymController],
  providers: [
    {
      provide: GymService,
      useFactory: (gymRepo) => new GymService(gymRepo),
      inject: [GYM_REPOSITORY_PORT],
    },
    {
      provide: GYM_REPOSITORY_PORT,
      useClass: PrismaGymRepository,
    },
  ],
  exports: [GymService],
})
export class GymModule {}
