import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { TaxonomyService } from "./taxonomy.service";
import { PublishingController } from "./publishing.controller";
import { PublishingService } from "./publishing.service";
import { TranslationService } from "./translation.service";
import { ListingLifecycleJob } from "./listing-lifecycle.job";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [PropertiesController, PublishingController],
  providers: [
    PropertiesService,
    TaxonomyService,
    PublishingService,
    TranslationService,
    ListingLifecycleJob,
  ],
  exports: [
    PropertiesService,
    TaxonomyService,
    PublishingService,
    TranslationService,
    ListingLifecycleJob,
  ],
})
export class PropertiesModule {}
