import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PropertiesModule } from "./properties/properties.module";
import { MediaModule } from "./media/media.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    PropertiesModule,
    MediaModule,
  ],
})
export class AppModule {}
