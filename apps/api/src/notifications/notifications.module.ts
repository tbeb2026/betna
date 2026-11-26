import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationService } from "./notifications.service";
import { NotificationRetryJob } from "./notifications-retry.job";
import { configuredChannelAdapters, NOTIFICATION_CHANNEL_ADAPTERS, WHATSAPP_OTP_PROVIDER } from "./channel.adapter";

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: NOTIFICATION_CHANNEL_ADAPTERS, useFactory: () => configuredChannelAdapters().channels },
    { provide: WHATSAPP_OTP_PROVIDER, useFactory: () => configuredChannelAdapters().whatsappOtp },
    NotificationService,
    NotificationRetryJob,
  ],
  exports: [NotificationService, WHATSAPP_OTP_PROVIDER],
})
export class NotificationsModule {}
