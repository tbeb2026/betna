import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PropertiesModule } from "./properties/properties.module";
import { MediaModule } from "./media/media.module";
import { UsersModule } from "./users/users.module";
import { VerificationModule } from "./verification/verification.module";
import { InquiriesModule } from "./inquiries/inquiries.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AvailabilityModule } from "./availability/availability.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    PropertiesModule,
    MediaModule,
    VerificationModule,
    NotificationsModule,
    InquiriesModule,
    AvailabilityModule,
    CommissionsModule,
    HealthModule,
  ],
})
export class AppModule {}
