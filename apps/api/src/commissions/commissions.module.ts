import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CommissionsController } from "./commissions.controller";
import { CommissionsService } from "./commissions.service";
import { ConversionsService } from "./conversions.service";

@Module({ imports: [PrismaModule, AuditModule, AuthModule], controllers: [CommissionsController], providers: [ConversionsService, CommissionsService], exports: [ConversionsService, CommissionsService] })
export class CommissionsModule {}
