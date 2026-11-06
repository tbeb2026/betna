import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [PrismaModule, AuditModule, UsersModule, AuthModule],
})
export class AppModule {}
