import { Injectable } from '@nestjs/common';
import { ISyncInvalidationNotifier, SyncInvalidationEvent } from '@core/application/ports/out/services.port';

@Injectable()
export class LoggingSyncInvalidationNotifier implements ISyncInvalidationNotifier {
  async notifySyncAvailable(event: SyncInvalidationEvent): Promise<void> {
    // Durable changes are already in Postgres SyncChange. This is the best-effort realtime wake-up hook.
    void event;
  }
}
