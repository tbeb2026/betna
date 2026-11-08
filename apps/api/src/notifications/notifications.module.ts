import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationService } from "./notifications.service";
import { NotificationRetryJob } from "./notifications-retry.job";
import { defaultChannelAdapters, NOTIFICATION_CHANNEL_ADAPTERS } from "./channel.adapter";

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: NOTIFICATION_CHANNEL_ADAPTERS, useFactory: defaultChannelAdapters },
    NotificationService,
    NotificationRetryJob,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
