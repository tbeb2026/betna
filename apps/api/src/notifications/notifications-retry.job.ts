import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { NotificationService } from "./notifications.service";

/** Small in-process worker; every delivery is DB-claimed, so multiple instances are safe. */
@Injectable()
export class NotificationRetryJob implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly notifications: NotificationService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    try {
      return await this.notifications.retryFailed();
    } catch {
      // A later tick retries after transient database/worker failures.
      return 0;
    }
  }
}
