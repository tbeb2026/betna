import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { TaxonomyService } from "./taxonomy.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, TaxonomyService],
  exports: [PropertiesService, TaxonomyService],
})
export class PropertiesModule {}
