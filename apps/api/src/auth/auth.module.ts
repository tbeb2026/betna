import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpService, NoopWhatsAppProvider } from "./otp.service";
import { SessionService } from "./session.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: OtpService,
      useFactory: () =>
        new OtpService({ provider: new NoopWhatsAppProvider() }),
    },
    { provide: SessionService, useFactory: () => new SessionService() },
  ],
  exports: [AuthService, OtpService, SessionService],
})
export class AuthModule {}
