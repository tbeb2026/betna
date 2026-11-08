import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";

@Module({ imports: [PrismaModule, AuditModule, NotificationsModule], controllers: [AvailabilityController], providers: [AvailabilityService], exports: [AvailabilityService] })
export class AvailabilityModule {}
