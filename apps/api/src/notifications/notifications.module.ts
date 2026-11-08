import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationService } from "./notifications.service";
import { defaultChannelAdapters, NOTIFICATION_CHANNEL_ADAPTERS } from "./channel.adapter";

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: NOTIFICATION_CHANNEL_ADAPTERS, useFactory: defaultChannelAdapters },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
