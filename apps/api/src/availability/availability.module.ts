import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";

@Module({ imports: [PrismaModule, AuditModule, AuthModule, NotificationsModule], controllers: [AvailabilityController], providers: [AvailabilityService], exports: [AvailabilityService] })
export class AvailabilityModule {}
