import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { TaxonomyService } from "./taxonomy.service";
import { PublishingController } from "./publishing.controller";
import { PublishingService } from "./publishing.service";
import { TranslationService } from "./translation.service";
import { ListingLifecycleJob } from "./listing-lifecycle.job";
import { PublicPropertiesController } from "./public-properties.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  controllers: [PropertiesController, PublishingController, PublicPropertiesController],
  providers: [
    PropertiesService,
    TaxonomyService,
    PublishingService,
    TranslationService,
    ListingLifecycleJob,
    SearchService,
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
