import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaModule } from "../prisma/prisma.module";
import {
  AdminInquiriesController,
  OwnerInquiriesController,
  PublicContactController,
  PublicInquiriesController,
} from "./inquiries.controller";
import { InquiriesService } from "./inquiries.service";
import { LocationReleaseService } from "./location-release.service";

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, NotificationsModule],
  controllers: [PublicInquiriesController, PublicContactController, OwnerInquiriesController, AdminInquiriesController],
  providers: [InquiriesService, LocationReleaseService],
  exports: [InquiriesService, LocationReleaseService],
})
export class InquiriesModule {}
