import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuditModule } from "../audit/audit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService } from "./otp.service";
import { SessionService } from "./session.service";
import { AuthSessionGuard } from "./guards";
import { NotificationsModule } from "../notifications/notifications.module";
import { WHATSAPP_OTP_PROVIDER } from "../notifications/channel.adapter";

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: OtpService,
      useFactory: (prisma: PrismaService, provider: import("../notifications/channel.adapter").WhatsAppOtpSender) =>
        new OtpService(prisma, { provider }),
      inject: [PrismaService, WHATSAPP_OTP_PROVIDER],
    },
    {
      provide: SessionService,
      useFactory: (prisma: PrismaService) => new SessionService(prisma),
      inject: [PrismaService],
    },
    AuthSessionGuard,
  ],
  exports: [AuthService, OtpService, SessionService, AuthSessionGuard],
})
export class AuthModule {}
