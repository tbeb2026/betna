import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersService } from "./users.service";
import { RolesGuard, TerritoryScopedGuard } from "./roles.guard";

@Module({
  imports: [PrismaModule],
  providers: [UsersService, RolesGuard, TerritoryScopedGuard],
  exports: [UsersService, RolesGuard, TerritoryScopedGuard],
})
export class UsersModule {}
