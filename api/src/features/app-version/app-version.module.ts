import { Module } from '@nestjs/common';
import { APP_VERSION_POLICY_PORT, type AppVersionPolicyPort } from '@core/application/ports/out/app-version-policy.port';
import { AppVersionService } from '@core/application/use-cases/app-version.service';
import { JsonAppVersionPolicyAdapter } from '@infrastructure/config/json-app-version-policy.adapter';
import { AppVersionController } from '@infrastructure/transport/rest/controllers/app-version.controller';

@Module({
  controllers: [AppVersionController],
  providers: [
    { provide: APP_VERSION_POLICY_PORT, useFactory: () => new JsonAppVersionPolicyAdapter() },
    {
      provide: AppVersionService,
      inject: [APP_VERSION_POLICY_PORT],
      useFactory: (policy: AppVersionPolicyPort) => new AppVersionService(policy),
    },
  ],
})
export class AppVersionModule {}
