import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PublishingService } from "./publishing.service";

/** Queue adapter boundary for expiry pauses and renewal reminders. */
@Injectable()
export class ListingLifecycleJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListingLifecycleJob.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly publishing: PublishingService) {}

  onModuleInit() {
    // Run once at boot so an overdue listing is not exposed until the first interval.
    void this.run().catch((error: unknown) => {
      this.logger.error("Initial listing lifecycle run failed", error);
    });
    const configured = Number(process.env.BETNA_LISTING_LIFECYCLE_INTERVAL_MS);
    const interval = Number.isFinite(configured) && configured > 0
      ? configured
      : 24 * 60 * 60 * 1000;
    this.timer = setInterval(() => {
      void this.run().catch((error: unknown) => {
        this.logger.error("Scheduled listing lifecycle run failed", error);
      });
    }, interval);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async run(now = new Date()) {
    const [expired, reminders] = await Promise.all([
      this.publishing.expireVerification(now),
      this.publishing.renewalReminderCandidates(now),
    ]);
    return { expired, reminders };
  }
}
