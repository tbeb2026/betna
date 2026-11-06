import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { RolesGuard, TerritoryScopedGuard } from "./roles.guard";

@Module({
  providers: [UsersService, RolesGuard, TerritoryScopedGuard],
  exports: [UsersService, RolesGuard, TerritoryScopedGuard],
})
export class UsersModule {}
