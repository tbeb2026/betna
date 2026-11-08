import { Injectable } from "@nestjs/common";
import { PublishingService } from "./publishing.service";

/** Queue adapter boundary for expiry pauses and renewal reminders. */
@Injectable()
export class ListingLifecycleJob {
  constructor(private readonly publishing: PublishingService) {}

  async run(now = new Date()) {
    const [expired, reminders] = await Promise.all([
      this.publishing.expireVerification(now),
      this.publishing.renewalReminderCandidates(now),
    ]);
    return { expired, reminders };
  }
}

