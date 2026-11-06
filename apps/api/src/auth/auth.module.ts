import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuditModule } from "../audit/audit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService, NoopWhatsAppProvider } from "./otp.service";
import { SessionService } from "./session.service";
import { AuthSessionGuard } from "./guards";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: OtpService,
      useFactory: (prisma: PrismaService) =>
        new OtpService(prisma, { provider: new NoopWhatsAppProvider() }),
      inject: [PrismaService],
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
